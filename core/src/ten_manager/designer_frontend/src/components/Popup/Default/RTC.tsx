//
// Copyright © 2025 Agora
// This file is part of TEN Framework, an open source project.
// Licensed under the Apache License, Version 2.0, with certain conditions.
// Refer to the "LICENSE" file in the root directory for more information.
//
import { useTranslation } from "react-i18next";
import AgoraRTC from "agora-rtc-react";
import {
  AgoraRTCProvider,
  LocalUser,
  RemoteUser,
  useIsConnected,
  useJoin,
  useLocalCameraTrack,
  useLocalMicrophoneTrack,
  usePublish,
  useRemoteUsers,
} from "agora-rtc-react";

import { IWidget } from "@/types/widgets";
import { useEffect, useState } from "react";
import { RtcTokenBuilder } from "agora-token";
import { useRTCEnvVar } from "@/api/services/env-var";
import React from "react";
import { toast } from "sonner";
import { useFlowStore } from "@/store";

const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

export const RTCWidgetTitle = () => {
  const { t } = useTranslation();
  return t("rtcInteraction.title");
}

const RTCWidgetContentInner = ({ widget: IWidget }) => {
  const [ready, setReady] = useState(false);
  const { nodes } = useFlowStore();
  const isConnected = useIsConnected();
  const { value, error, isLoading } = useRTCEnvVar();
  const { appId, appCert } = value || {};
  const [channel, setChannel] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [uid, setUid] = useState<number | null>(null);

  React.useEffect(() => {
    if (error) {
      toast.error(error.message);
    }
  }, [error]);

  React.useEffect(() => {
    const rtcNode = nodes.find((node) => node.data.addon === "agora_rtc");
    if (rtcNode) {
      const property = rtcNode.data.property;
      if (property) {
        const propChannel = (property["channel"] || "") as string;
        const propUid = (property["remote_stream_id"] || 1000) as number;
        setChannel(propChannel);
        setUid(propUid);
      }
    }
  }, [nodes]);

  useEffect(() => {
    if (!appId || !channel || uid === null) return;
    let token = appId;
    
    if (appCert) {
      token = RtcTokenBuilder.buildTokenWithUserAccount(
        appId,
        appCert || "",
        channel,
        uid,
        1,
        Math.floor(Date.now() / 1000) + 3600, // 1 hour expiration
        Math.floor(Date.now() / 1000) + 3600  // 1 hour expiration
      );
    }
    setToken(token);
    setReady(true);
    
    return () => { };
  }, [channel, appId, appCert, uid]);

  useJoin(
    {
      appid: appId || "",
      channel: channel || "",
      token: token ? token : null,
      uid: uid
    },
    ready
  );
  //local user
  const [micOn, setMic] = useState(true);
  const [cameraOn, setCamera] = useState(true);
  const { localMicrophoneTrack } = useLocalMicrophoneTrack(micOn);
  const { localCameraTrack } = useLocalCameraTrack(cameraOn);
  usePublish([localMicrophoneTrack, localCameraTrack]);
  //remote users
  const remoteUsers = useRemoteUsers();

  return (
    <div className="flex flex-col gap-2 h-full w-full">
      <LocalUser
        cameraOn={cameraOn}
        micOn={micOn}
        videoTrack={localCameraTrack}
        cover="https://www.agora.io/en/wp-content/uploads/2022/10/3d-spatial-audio-icon.svg"
      >
        <samp className="user-name">You</samp>
      </LocalUser>
      {remoteUsers.map((user) => (
        <div className="user" key={user.uid}>
          <RemoteUser cover="https://www.agora.io/en/wp-content/uploads/2022/10/3d-spatial-audio-icon.svg" user={user}>
            <samp className="user-name">{user.uid}</samp>
          </RemoteUser>
        </div>
      ))}
    </div>
  );
};

export const RTCWidgetContent = (props: { widget: IWidget }) => {
  const { widget } = props;

  return (
    <AgoraRTCProvider client={client}>
      <RTCWidgetContentInner widget={widget} />
    </AgoraRTCProvider>
  );
};