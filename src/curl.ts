const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in .env")
  process.exit(1)
}

const REDIRECT_URL = "eg:http://localhost:8080" // your redirect URL - must be localhost URL and/or HTTPS

const AUTHORIZATION_ENDPOINT = "https://accounts.spotify.com/authorize"
const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token"
const SCOPE = "user-read-private user-read-email"

const result = Bun.spawnSync({
  cmd: [
    "curl",
    "-X",
    "POST",
    "https://accounts.spotify.com/api/token",
    "-H",
    "Content-Type: application/x-www-form-urlencoded",
    "-d",
    `grant_type=client_credentials&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`,
  ],
  stdout: "pipe",
  stderr: "pipe",
})

if (result.exitCode !== 0) {
  console.error("curl failed:", result.stderr.toString())
  process.exit(1)
}

const data = JSON.parse(result.stdout.toString())
console.log(data)

// import { http } from "./http"

// const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID
// const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET

// if (!CLIENT_ID || !CLIENT_SECRET) {
//   console.error("Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in .env")
//   process.exit(1)
// }

// const result = await http<{
//   access_token: string
//   token_type: string
//   expires_in: number
// }>({
//   method: "POST",
//   url: "https://accounts.spotify.com/api/token",
//   headers: { "Content-Type": "application/x-www-form-urlencoded" },
//   body: {
//     grant_type: "client_credentials",
//     client_id: CLIENT_ID,
//     client_secret: CLIENT_SECRET,
//   },
// })

// if (result.error) {
//   console.error("Error:", result.error)
//   process.exit(1)
// }

// console.log(result.data)

// import { Effect } from "effect"
// import { HttpService } from "./http"

// const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID
// const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET

// if (!CLIENT_ID || !CLIENT_SECRET) {
//   console.error("Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in .env")
//   process.exit(1)
// }

// const program = Effect.gen(function* () {
//   const http = yield* HttpService
//   const result = yield* http.request<{
//     access_token: string
//     token_type: string
//     expires_in: number
//   }>({
//     method: "POST",
//     url: "https://accounts.spotify.com/api/token",
//     headers: { "Content-Type": "application/x-www-form-urlencoded" },
//     body: {
//       grant_type: "client_credentials",
//       client_id: CLIENT_ID!,
//       client_secret: CLIENT_SECRET!,
//     },
//   })
//   return result
// })

// const result = await Effect.runPromise(
//   program.pipe(Effect.provide(HttpService.Live))
// )

// console.log(result)
