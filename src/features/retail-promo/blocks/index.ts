// Imports statiques — l'évaluation de chaque module enregistre son bloc via
// registerPromoBlock() (effet de bord). Même mécanique que le registre des nodes
// de workflow (reference_workflow_registry_side_effect_init).
import './badgeRemise'
import './prixBarre'
import './bandeauLot'
import './bandeauValidite'
import './mentions'
import './badgeStatut'
import './cadrePhoto'
import './accroche'

export { initPromoBlocks, getPromoBlock, listPromoBlocks } from './registry'
