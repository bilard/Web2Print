import { describe, it, expect } from 'vitest'
import { clientIpFromHeaders } from './geoip'

describe('clientIpFromHeaders', () => {
  it('préfère fastly-client-ip', () =>
    expect(clientIpFromHeaders({ 'fastly-client-ip': '8.8.8.8', 'x-forwarded-for': '1.1.1.1' })).toBe('8.8.8.8'))
  it('prend la tête de x-forwarded-for (client, proxies…)', () =>
    expect(clientIpFromHeaders({ 'x-forwarded-for': '212.27.48.10, 35.0.0.1, 10.0.0.2' })).toBe('212.27.48.10'))
  it('repli sur x-real-ip', () =>
    expect(clientIpFromHeaders({ 'x-real-ip': '9.9.9.9' })).toBe('9.9.9.9'))
  it('ignore les IP privées et passe au candidat suivant', () =>
    expect(clientIpFromHeaders({ 'fastly-client-ip': '192.168.1.4', 'x-forwarded-for': '212.27.48.10' })).toBe('212.27.48.10'))
  it('null si aucune IP publique valide', () =>
    expect(clientIpFromHeaders({ 'x-forwarded-for': '10.0.0.1, pas-une-ip' })).toBeNull())
  it('null si en-têtes absents', () => expect(clientIpFromHeaders({})).toBeNull())
  it('gère une valeur d\'en-tête en tableau', () =>
    expect(clientIpFromHeaders({ 'x-forwarded-for': ['8.8.4.4, 1.2.3.4'] })).toBe('8.8.4.4'))
})
