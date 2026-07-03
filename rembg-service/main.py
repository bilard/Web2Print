# Service de détourage automatique (rembg / isnet-general-use) — Cloud Run.
# Auth : jeton Firebase ID (projet web2print-6fe5a) en Bearer, vérifié via les
# certificats publics Google (aucune clé de service requise pour la vérification).
# Entrée : POST /remove avec le binaire de l'image ; sortie : PNG avec alpha.
import io
import os

import firebase_admin
from firebase_admin import auth as fb_auth
from flask import Flask, Response, jsonify, request
from PIL import Image
from rembg import new_session, remove

PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID", "web2print-6fe5a")
MODEL = os.environ.get("REMBG_MODEL", "isnet-general-use")
MAX_BYTES = 15 * 1024 * 1024

firebase_admin.initialize_app(options={"projectId": PROJECT_ID})
SESSION = new_session(MODEL)  # chargé au boot (modèle pré-téléchargé dans l'image)

app = Flask(__name__)


@app.after_request
def add_cors(resp):
    # CORS sur TOUTES les réponses (y compris les erreurs générées par Flask) :
    # sans ces en-têtes, le navigateur masque l'erreur réelle en « Failed to fetch ».
    for k, v in CORS_HEADERS.items():
        resp.headers.setdefault(k, v)
    return resp

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "3600",
}


def downscale(data: bytes, max_side: int) -> bytes:
    """Réduit l'image au plafond donné (côté long) — no-op si déjà en dessous."""
    im = Image.open(io.BytesIO(data))
    im.load()
    w, h = im.size
    if max(w, h) <= max_side:
        return data
    scale = max_side / max(w, h)
    im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return buf.getvalue()


# NB : « /healthz » est INTERCEPTÉ par le frontend Google (404) — ne pas l'utiliser.
@app.get("/health")
def health():
    return jsonify({"ok": True, "model": MODEL})


@app.route("/remove", methods=["OPTIONS"])
def remove_preflight():
    return Response(status=204, headers=CORS_HEADERS)


@app.post("/remove")
def remove_background():
    authz = request.headers.get("Authorization", "")
    if not authz.startswith("Bearer "):
        return jsonify({"error": "missing_bearer_token"}), 401, CORS_HEADERS
    try:
        fb_auth.verify_id_token(authz[7:])
    except Exception as err:  # jeton invalide/expiré
        return jsonify({"error": "invalid_token", "detail": str(err)}), 401, CORS_HEADERS

    data = request.get_data()
    if not data:
        return jsonify({"error": "empty_body"}), 400, CORS_HEADERS
    if len(data) > MAX_BYTES:
        return jsonify({"error": "image_too_large", "maxBytes": MAX_BYTES}), 413, CORS_HEADERS

    # ?matting=1 : alpha matting (contours doux, préserve au mieux les ombres au
    # sol semi-transparentes). Plus lent ; repli automatique sur le masque net.
    matting = request.args.get("matting") == "1"
    kwargs = {}
    if matting:
        kwargs = dict(
            alpha_matting=True,
            alpha_matting_foreground_threshold=240,
            alpha_matting_background_threshold=15,
            alpha_matting_erode_size=10,
        )
    # PLAFOND de résolution : pymatting est ~quadratique → au-delà, le worker
    # dépasse le timeout et la connexion est coupée (« Failed to fetch » client).
    # 1600 px suffit largement pour des fiches produit ; 1200 px en matting.
    try:
        data = downscale(data, 1200 if matting else 1600)
    except Exception:
        return jsonify({"error": "invalid_image"}), 422, CORS_HEADERS
    try:
        out = remove(data, session=SESSION, **kwargs)
    except Exception:
        if not kwargs:
            return jsonify({"error": "rembg_failed"}), 422, CORS_HEADERS
        try:
            out = remove(data, session=SESSION)  # repli sans matting
        except Exception as err:
            return jsonify({"error": "rembg_failed", "detail": str(err)}), 422, CORS_HEADERS
    return Response(out, mimetype="image/png", headers=CORS_HEADERS)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8080")))
