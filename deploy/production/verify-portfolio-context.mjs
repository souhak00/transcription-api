const representativeId = process.argv[2];

if (!representativeId) {
  throw new Error("Le representant_id est requis.");
}

const endpoint = process.env.PORTFOLIO_WEBHOOK_URL
  ?? "http://n8n:5678/webhook/crm/portefeuille";
const staleContext = ["CLI-2026-LC-000011"];
const cases = [
  {
    name: "retard",
    filters: { a_relancer: true },
    sort: [{ field: "priority_score", direction: "desc" }]
  },
  { name: "preapprouves", filters: { statut: "Préapprouvé" }, sort: [] },
  { name: "en-analyse", filters: { statut: "En analyse" }, sort: [] }
];

for (const testCase of cases) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      security_context: { representant_id: representativeId },
      command: {
        parameters: {
          scope: "portfolio",
          filters: testCase.filters,
          sort: testCase.sort,
          limit: 20,
          aggregate: null
        },
        conversation_context: { last_result_codes: staleContext }
      }
    })
  });
  const body = await response.text();
  console.log(`${testCase.name}: HTTP ${response.status}`);
  console.log(body);
}
