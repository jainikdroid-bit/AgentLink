import { readFile } from "node:fs/promises"
import { sign } from "node:crypto"

const scope = "https://www.googleapis.com/auth/firebase.messaging"
const oauthUrl = "https://oauth2.googleapis.com/token"
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url")

async function authenticate(account) {
  const now = Math.floor(Date.now() / 1000)
  const claims = encode({ iss: account.client_email, scope, aud: oauthUrl, iat: now, exp: now + 3600 })
  const unsigned = encode({ alg: "RS256", typ: "JWT" }) + "." + claims
  const signature = sign("RSA-SHA256", Buffer.from(unsigned), account.private_key).toString("base64url")
  const response = await fetch(oauthUrl, {
    method: "POST",
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: unsigned + "." + signature }),
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new Error("OAuth HTTP " + response.status)
  return response.json()
}

export const AgentLinkFcm = async () => {
  const credentialsFile = process.env.AGENTLINK_FCM_CREDENTIALS
  const tokenFile = process.env.AGENTLINK_FCM_DEVICE_TOKEN_FILE
  if (!credentialsFile || !tokenFile) return {}
  let cached
  const active = new Set()
  return {
    event: async ({ event }) => {
      const props = event.properties ?? {}
      const sessionId = props.sessionID
      if (typeof sessionId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)) return
      if (event.type === "session.status" && props.status?.type === "busy") active.add(sessionId)
      let category, title
      if (event.type === "session.idle" && active.delete(sessionId)) {
        category = "completed"
        title = "Agent finished"
      } else if (event.type === "session.error") {
        active.delete(sessionId)
        category = "errors"
        title = "Agent reported an error"
      } else {
        return
      }
      try {
        const account = JSON.parse(await readFile(credentialsFile, "utf8"))
        const token = (await readFile(tokenFile, "utf8")).trim().replace(/^\uFEFF/, "")
        if (!token || !/^[a-z0-9-]+$/.test(account.project_id)) return
        if (!cached || cached.expires < Date.now()) {
          const result = await authenticate(account)
          cached = { token: result.access_token, expires: Date.now() + (result.expires_in - 60) * 1000 }
        }
        const response = await fetch("https://fcm.googleapis.com/v1/projects/" + account.project_id + "/messages:send", {
          method: "POST",
          headers: { Authorization: "Bearer " + cached.token, "Content-Type": "application/json" },
          body: JSON.stringify({ message: { token, notification: { title, body: "Open the session in AgentLink" },
            data: { sessionId, category }, android: { notification: { channel_id: "prompts" } } } }),
          signal: AbortSignal.timeout(10000),
        })
        if (response.status === 401) cached = undefined
        if (!response.ok) throw new Error("FCM HTTP " + response.status)
      } catch (error) {
        console.warn("[AgentLink FCM] " + (error instanceof Error && /^(OAuth|FCM) HTTP \d+$/.test(error.message) ? error.message : "Could not send notification"))
      }
    },
  }
}
