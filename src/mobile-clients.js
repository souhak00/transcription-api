import { requestPortfolioData } from './agent.js';

const REPRESENTATIVE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLIENT_CODE = /^CLI-[0-9]{4}-[A-Z]{2}-[0-9]{6}$/;

export function normalizeMobileClientCode(value) {
  const code = String(value ?? '').trim().toUpperCase();
  if (!CLIENT_CODE.test(code)) throw new TypeError('Code de dossier client invalide.');
  return code;
}

function representative(value) {
  const id = String(value ?? '').trim();
  if (!REPRESENTATIVE_ID.test(id)) throw new TypeError('Identité du représentant invalide.');
  return id;
}

function publicClient(row) {
  const clientCode = normalizeMobileClientCode(row?.code_client);
  const clientName = String(row?.nom_client ?? '').trim().slice(0, 160);
  const status = String(row?.statut_dossier ?? '').trim().slice(0, 80);
  if (!clientName) throw new TypeError('Nom du client manquant.');
  return { clientCode, clientName, status };
}

function searchable(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export async function listMobileClients(representativeId, query = '', options = {}) {
  const id = representative(representativeId);
  const term = String(query ?? '').trim().slice(0, 80);
  const request = options.requestPortfolio ?? requestPortfolioData;
  const result = await request({ limit: 100, sort: [{ field: 'updated_at', direction: 'desc' }] }, { representativeId: id });
  const needle = searchable(term);
  const rows = [];
  for (const row of Array.isArray(result?.rows) ? result.rows : []) {
    let client;
    try { client = publicClient(row); } catch { continue; }
    if (needle && !searchable(`${client.clientName} ${client.clientCode}`).includes(needle)) continue;
    if (!rows.some(item => item.clientCode === client.clientCode)) rows.push(client);
    if (rows.length === 20) break;
  }
  return rows;
}

export async function authorizeMobileClient(representativeId, requestedCode, options = {}) {
  const id = representative(representativeId);
  const clientCode = normalizeMobileClientCode(requestedCode);
  const request = options.requestPortfolio ?? requestPortfolioData;
  const result = await request({ limit: 2, selectionCodes: [clientCode] }, { representativeId: id });
  const matches = (Array.isArray(result?.rows) ? result.rows : [])
    .map(row => { try { return publicClient(row); } catch { return null; } })
    .filter(row => row?.clientCode === clientCode);
  if (matches.length !== 1) {
    const error = new Error('Dossier introuvable ou non autorisé pour ce représentant.');
    error.statusCode = 404;
    throw error;
  }
  return matches[0];
}
