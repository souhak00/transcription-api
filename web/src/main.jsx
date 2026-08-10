import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { initializeIdentity } from "./auth.js";
import "./styles.css";

const root = createRoot(document.getElementById("root"));

try {
  const identity = await initializeIdentity();
  root.render(
    <StrictMode>
      <App identity={identity} />
    </StrictMode>
  );
} catch (error) {
  root.render(
    <main className="identity-error" role="alert">
      <h1>Connexion indisponible</h1>
      <p>{error.message}</p>
      <p>Vérifiez que Keycloak est démarré et que le realm CRM est configuré.</p>
    </main>
  );
}
