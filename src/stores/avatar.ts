import { create } from "zustand"
import type { MascotState } from "../components/mascots/types"

/** What the agent is doing right now (set by the chat's status line), for the floating 3D Cheri. */
interface AvatarActivity {
  activity: MascotState | null
  setActivity: (activity: MascotState | null) => void
}

export const useAvatar = create<AvatarActivity>((set) => ({
  activity: null,
  setActivity: (activity) => set((s) => (s.activity === activity ? s : { activity })),
}))
