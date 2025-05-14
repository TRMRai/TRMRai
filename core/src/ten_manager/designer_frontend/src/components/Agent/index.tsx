"use client"

import { cn } from "@/lib/utils"
// import AudioVisualizer from "../audioVisualizer"
import AudioVisualizer, { useMultibandTrackVolume } from "@/components/Agent/AudioVisualizer"
import { RemoteAudioTrack, useRemoteUsers, useRemoteUserTrack } from "agora-rtc-react";




export default function AgentView() {
  const remoteUsers = useRemoteUsers();
  const { track } = useRemoteUserTrack(remoteUsers[0], "audio");

  const subscribedVolumes = useMultibandTrackVolume(track, 12)

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col items-center justify-center px-4 py-5"
      )}
    >
      <div className="h-14 w-full flex items-center justify-center ">
        <AudioVisualizer
          type="agent"
          frequencies={subscribedVolumes}
          barWidth={6}
          minBarHeight={6}
          maxBarHeight={56}
          borderRadius={2}
          gap={6}
        />
        {track && (
          <RemoteAudioTrack key={track.getUserId()} play track={track} />
        )}
      </div>
    </div>
  )
}
