import assert from "node:assert/strict";
import test from "node:test";
import {
  AuthenticationError,
  extractRepresentative,
  loadKeycloakConfig,
  readBearerToken,
  verifyAccessToken
} from "../../src/keycloak.js";

const representativeId = "ac7b7a4b-907e-4733-a0de-4e5ed40e6af0";

test("loadKeycloakConfig sépare l’issuer public du JWKS interne", () => {
  const config = loadKeycloakConfig({
    KEYCLOAK_ISSUER: "http://localhost:8080/realms/crm-local/",
    KEYCLOAK_JWKS_URL: "http://keycloak:8080/realms/crm-local/protocol/openid-connect/certs",
    KEYCLOAK_AUDIENCE: "crm-api"
  });

  assert.equal(config.issuer, "http://localhost:8080/realms/crm-local");
  assert.equal(config.audience, "crm-api");
  assert.equal(config.configured, true);
});

test("readBearerToken exige le schéma Bearer", () => {
  assert.equal(readBearerToken("Bearer jeton-test"), "jeton-test");
  assert.throws(
    () => readBearerToken("Basic abc"),
    (error) => error instanceof AuthenticationError && error.statusCode === 401
  );
});

test("extractRepresentative exige le rôle et le representant_id signé", () => {
  assert.deepEqual(
    extractRepresentative({
      sub: "keycloak-user-id",
      email: "representant@example.test",
      name: "Représentant MVP",
      representant_id: representativeId,
      realm_access: { roles: ["representant"] }
    }),
    {
      subject: "keycloak-user-id",
      email: "representant@example.test",
      role: "representant",
      representantId: representativeId,
      representantName: "Représentant MVP"
    }
  );

  assert.throws(
    () => extractRepresentative({ representant_id: representativeId, realm_access: { roles: [] } }),
    (error) => error instanceof AuthenticationError && error.statusCode === 403
  );
});

test("verifyAccessToken impose issuer, audience et RS256", async () => {
  let receivedOptions;
  const user = await verifyAccessToken("jeton", {
    configured: true,
    issuer: "http://localhost:8080/realms/crm-local",
    audience: "crm-api",
    jwksUrl: "http://keycloak:8080/certs"
  }, {
    keySet: {},
    jwtVerifyImplementation: async (_token, _keySet, options) => {
      receivedOptions = options;
      return {
        payload: {
          sub: "keycloak-user-id",
          representant_id: representativeId,
          realm_access: { roles: ["representant"] }
        }
      };
    }
  });

  assert.equal(user.representantId, representativeId);
  assert.deepEqual(receivedOptions.algorithms, ["RS256"]);
  assert.equal(receivedOptions.audience, "crm-api");
});
