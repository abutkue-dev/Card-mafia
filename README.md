# MAFIA: SHADOWS

A landscape-first Mafia card game prototype. The current room/game implementation is local and simulated; voice uses LiveKit only for authenticated room memberships provisioned by a trusted multiplayer backend.

## Run locally

```sh
npm install
npm run dev
```

## Build

```sh
npm run build
```

## Real-time voice setup

Voice is implemented with `livekit-client` and the authenticated Supabase Edge Function at `supabase/functions/livekit-voice`. The microphone is requested only after the player presses **Микрофон нээх**. The client does not record or persist audio. Live audio is published through LiveKit WebRTC to participants authorized for that room.

The UI does not simulate a working voice connection. Without the configuration and a real room membership, joining is rejected and the controls report that voice is unavailable.

1. Configure the client in `.env.local` (use `.env.example` as a template):

   ```sh
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
   VITE_LIVEKIT_TOKEN_URL=https://your-project-ref.supabase.co/functions/v1/livekit-voice
   ```

2. Apply the database migration and deploy the Edge Function:

   ```sh
   supabase db push
   supabase functions deploy livekit-voice
   ```

3. Configure **server-side only** Edge Function secrets:

   ```sh
   supabase secrets set LIVEKIT_URL=wss://your-livekit-host
   supabase secrets set LIVEKIT_API_KEY=your-livekit-api-key
   supabase secrets set LIVEKIT_API_SECRET=your-livekit-api-secret
   supabase secrets set ROOM_CONTROLLER_SECRET=a-long-random-secret
   ```

   Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to deployed Edge Functions. Never put the LiveKit API secret, Supabase service-role key, or controller secret in a `VITE_` variable or browser code.

4. Connect the trusted multiplayer room controller. The local demo does not create online rooms, so it does not create voice memberships. For each real room, the authenticated server must create the `voice_rooms` row and its `voice_room_members` rows using its server-side Supabase service-role client. Memberships must use authenticated Supabase user IDs and server-verified display names, host status, alive status, and mute status. Do not grant browser clients write access to these tables.

5. Before each authoritative game phase change, the trusted game controller must synchronize the room by POSTing to the Edge Function with `x-room-controller-key: <ROOM_CONTROLLER_SECRET>` and JSON such as:

   ```json
   {
     "action": "sync",
     "roomCode": "NIGHT-7X",
     "phase": "discussion",
     "postGameVoice": false
   }
   ```

   Supported phases are `lobby`, `role-reveal`, `night`, `morning`, `discussion`, `voting`, and `results`. The server recalculates LiveKit publish permission on each sync; it disables publishing during role reveal, night, and morning, blocks eliminated players during active play, and permits post-game voice only when `postGameVoice` is true. The Edge Function also validates room membership for token and permission requests, and validates the host before applying a mute. Keep this sync in the same trusted game-controller transition that changes the authoritative game phase.

The included local lobby and game are not backed by a multiplayer controller or synchronized phase state. Consequently, deploying the voice service alone is not enough to enable multiplayer in this prototype. A real two-client voice test requires the external room controller to provision both memberships and synchronize phases, along with a configured LiveKit project and reachable HTTPS/WSS endpoints. No successful two-client connection is claimed here.

Dependencies: the browser adds the npm package `livekit-client`; the Edge Function imports `npm:livekit-server-sdk@2` and `npm:@supabase/supabase-js@2` at runtime. See `src/voicePolicy.test.ts` for phase-permission checks; run it with `node --experimental-strip-types src/voicePolicy.test.ts`.