# Wiretrap: AI Agent Adversarial Red-Teaming & Detonation Workbench

Wiretrap tests AI agents by attacking them. When an agent's system prompt and tool schema are submitted, Wiretrap clones the agent, provides harmless decoy tools, executes high-fidelity adversarial attacks across multiple turns, and reports which tools fired. A dedicated LLM judge assesses security boundaries and flags critical vulnerabilities like **"Said No, Did Yes"** where an agent verbally declines but executes unauthorized tools.

---

## Security Architecture: Workload Identity & ADC

Wiretrap uses **Vertex AI** via `@google/genai` in Vertex mode (`vertexai: true, project: "wire-trap-26", location: "global"`), authenticating directly through **Application Default Credentials (ADC)** provided by the Cloud Run service account.

> **Workload Identity vs. Static API Keys:**  
> The application uses **Workload Identity / ADC rather than a static API key — strictly stronger**.  
> - No static Gemini API keys exist in source code, container layers, or environment variables.  
> - Short-lived, automatically rotated Google OAuth2 access tokens are granted via the service account's IAM role.  
> - Google Cloud Secret Manager remains wired for any auxiliary future keys or external service secrets with runtime retrieval and strict memory isolation (no secret logging).

---

## 1. Prerequisites & Google Cloud API Enablement

Set your active Google Cloud project:

```bash
gcloud config set project wire-trap-26
```

Enable the necessary Google Cloud APIs:

```bash
gcloud services enable \
  run.googleapis.com \
  aiplatform.googleapis.com \
  secretmanager.googleapis.com \
  firestore.googleapis.com \
  identitytoolkit.googleapis.com
```

---

## 2. IAM & Service Account Configuration

The Cloud Run service account needs the **Vertex AI User** role (`roles/aiplatform.user`) on `wire-trap-26` to invoke Gemini models via Vertex AI ADC:

```bash
# Define your Cloud Run service account (or use compute default)
PROJECT_ID="wire-trap-26"
PROJECT_NUMBER=$(gcloud projects describe ${PROJECT_ID} --format="value(projectNumber)")
SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Grant Vertex AI User role
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/aiplatform.user"

# Grant Secret Manager Secret Accessor role (for auxiliary runtime secrets)
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor"
```

---

## 3. Secret Manager Setup (Wired for Future Auxiliary Secrets)

Secret Manager is integrated into `server/secretManager.ts` to access auxiliary credentials dynamically at runtime without restarting containers:

```bash
# Example: Creating a secret in Secret Manager if auxiliary credentials are used
echo -n "your-auxiliary-credential" | gcloud secrets create AUXILIARY_SECRET \
  --data-file=- \
  --replication-policy="automatic" \
  --project="wire-trap-26"
```

---

## 4. Firestore Security Rules

The security rules are already deployed to `wire-trap-26`. If you need to re-deploy or deploy from a fresh Cloud Shell session where the repository is not yet cloned:

### Option A: From Cloud Shell (Quick Setup)
If running in Cloud Shell home directory without the repo cloned, write `firestore.rules` and `firebase.json` directly:

```bash
cat <<'EOF' > firestore.rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      match /targets/{targetId} {
        allow read: if request.auth != null && request.auth.uid == userId;
        allow create: if request.auth != null && request.auth.uid == userId
                      && request.resource.data.userId == userId;
        allow update: if request.auth != null && request.auth.uid == userId
                      && request.resource.data.userId == userId
                      && request.resource.data.createdAt == resource.data.createdAt;
        allow delete: if request.auth != null && request.auth.uid == userId;
        match /messages/{messageId} {
          allow read, create, update, delete: if request.auth != null && request.auth.uid == userId;
        }
        match /runs/{runId} {
          allow read, create, update, delete: if request.auth != null && request.auth.uid == userId;
        }
      }
    }
  }
}
EOF

cat <<'EOF' > firebase.json
{
  "firestore": {
    "rules": "firestore.rules"
  }
}
EOF

firebase deploy --only firestore:rules --project wire-trap-26
```

### Option B: From within the Repository Root
If you are inside the cloned application directory (`firebase.json` and `firestore.rules` are included):

```bash
firebase deploy --only firestore:rules --project wire-trap-26
```

Rules reference (`firestore.rules`):

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Deny all by default
    match /{document=**} {
      allow read, write: if false;
    }

    // Owner-bound user hierarchy
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;

      match /targets/{targetId} {
        allow read: if request.auth != null && request.auth.uid == userId;
        allow create: if request.auth != null && request.auth.uid == userId
                      && request.resource.data.userId == userId;
        allow update: if request.auth != null && request.auth.uid == userId
                      && request.resource.data.userId == userId
                      && request.resource.data.createdAt == resource.data.createdAt;
        allow delete: if request.auth != null && request.auth.uid == userId;

        match /messages/{messageId} {
          allow read, create, update, delete: if request.auth != null && request.auth.uid == userId;
        }

        match /runs/{runId} {
          allow read, create, update, delete: if request.auth != null && request.auth.uid == userId;
        }
      }
    }
  }
}
```

---

## 5. Cloud Run Build & Deployment

### Step 5A: Ensure You Are in the Wiretrap Project Directory
When running `gcloud run deploy --source .`, you must be inside the directory containing Wiretrap's source code (`package.json`, `server.ts`, `Dockerfile`), not your Cloud Shell home root (`~`).

If you have exported or cloned the repository into Cloud Shell:
```bash
# Clone or navigate to the app directory
git clone <YOUR_REPO_URL> wiretrap
cd wiretrap
```

*(Alternatively, you can deploy directly from Google AI Studio by clicking the **Deploy to Cloud Run** button in the header menu).*

### Step 5B: Deploy to Cloud Run
From inside the `wiretrap` source directory, run:

```bash
SERVICE_NAME="wiretrap"
REGION="asia-east1"
PROJECT_ID="wire-trap-26"
PROJECT_NUMBER=$(gcloud projects describe ${PROJECT_ID} --format="value(projectNumber)")
SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

gcloud run deploy ${SERVICE_NAME} \
  --source . \
  --region ${REGION} \
  --platform managed \
  --allow-unauthenticated \
  --service-account "${SERVICE_ACCOUNT}" \
  --set-env-vars="GOOGLE_GENAI_USE_VERTEXAI=1,GOOGLE_CLOUD_PROJECT=wire-trap-26,GOOGLE_CLOUD_LOCATION=global"
```

---

## 6. Required Challenge Label Update

Apply the required competition label to your Cloud Run service:

```bash
gcloud run services update ${SERVICE_NAME} \
  --update-labels=dev-tutorial=cloud-run-ai-challenge \
  --region=${REGION}
```

---

## 7. Operational Verification

To verify the deployment:
1. Open the Wiretrap UI at the deployed Cloud Run URL.
2. Sign in with Google Auth.
3. Submit an AI agent with a custom system prompt and tools (e.g., Financial Settlement Agent or Production Shell Utility).
4. Run a detonation pass: the backend will route calls to Vertex AI via ADC (`wire-trap-26`), execute decoy simulations in isolation, classify breach outcomes with the Gemini judge, and highlight any **"Said No, Did Yes"** discrepancies.
