"use client"

import * as React from "react"
// import CamSelect from "./camSelect"
import { CameraIcon } from "lucide-react"
// import { LocalStreamPlayer } from "../streamPlayer"
// import { useSmallScreen } from "@/common"
import {
  DeviceSelect,
} from "@/components/Agent/Microphone"
import { Button } from "@/components/ui/Button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
// import { VIDEO_SOURCE_OPTIONS, VideoSourceType } from "@/common"
import { MonitorIcon, MonitorXIcon } from "lucide-react"
import AgoraRTC, { ICameraVideoTrack, ILocalVideoTrack, LocalVideoTrack } from "agora-rtc-react"


export enum VideoSourceType {
  CAMERA = 'camera',
  SCREEN = 'screen',
}

export const VIDEO_SOURCE_OPTIONS = [{
  label: "Camera",
  value: VideoSourceType.CAMERA,
}, {
  label: "Screen Share",
  value: VideoSourceType.SCREEN,
}]

export const ScreenIconByStatus = (
  props: React.SVGProps<SVGSVGElement> & { active?: boolean; color?: string },
) => {
  const { active, color, ...rest } = props
  if (active) {
    return <MonitorIcon color={color || "#3D53F5"} {...rest} />
  }
  return <MonitorXIcon color={color || "#667085"} {...rest} />
}

export function VideoDeviceWrapper(props: {
  children: React.ReactNode
  title: string
  Icon: (
    props: React.SVGProps<SVGSVGElement> & { active?: boolean },
  ) => React.ReactNode
  onIconClick: () => void
  videoSourceType: VideoSourceType
  onVideoSourceChange: (value: VideoSourceType) => void
  isActive: boolean
  select?: React.ReactNode
}) {
  const { Icon, onIconClick, isActive, select, children, onVideoSourceChange, videoSourceType } = props

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="text-sm font-medium">{props.title}</div>
          <div className="w-[150px]">
            <Select value={videoSourceType} onValueChange={onVideoSourceChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VIDEO_SOURCE_OPTIONS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="border-secondary bg-transparent"
            onClick={onIconClick}
          >
            <Icon className="h-5 w-5" active={isActive} />
          </Button>
          {select}
        </div>
      </div>
      {children}
    </div>
  )
}

export default function VideoBlock(props: {
  videoSourceType: VideoSourceType,
  onVideoSourceChange:(value: VideoSourceType) => void,
  videoTrack: ILocalVideoTrack | null,
  videoOn: boolean,
  setVideoOn: (value: boolean) => void,
}) {
  const { videoTrack, videoOn, setVideoOn, videoSourceType, onVideoSourceChange } = props

  const onClickMute = () => {
    setVideoOn(!videoOn)
  }

  return (
    <VideoDeviceWrapper
      title="VIDEO"
      Icon={CameraIcon}
      onIconClick={onClickMute}
      isActive={videoOn}
      videoSourceType={videoSourceType}
      onVideoSourceChange={onVideoSourceChange}
      select={videoSourceType === VideoSourceType.CAMERA ? <CamSelect videoTrack={videoTrack as ICameraVideoTrack} /> : <div className="w-[180px]" />}
    >
      <div className="my-3 h-60 w-full overflow-hidden rounded-lg">
        {/* <LocalStreamPlayer videoTrack={videoSourceType === VideoSourceType.CAMERA ? cameraTrack : screenTrack} /> */}
        <LocalVideoTrack key={videoTrack?.getTrackId()} track={videoTrack} play />
      </div>
    </VideoDeviceWrapper>
  )
}

interface SelectItem {
  label: string
  value: string
  deviceId: string
}

const DEFAULT_ITEM: SelectItem = {
  label: "Default",
  value: "default",
  deviceId: "",
}

const CamSelect = (props: { videoTrack?: ICameraVideoTrack }) => {
  const { videoTrack } = props
  const [items, setItems] = React.useState<SelectItem[]>([DEFAULT_ITEM])
  const [value, setValue] = React.useState("default")

  React.useEffect(() => {
    if (videoTrack) {
      const label = videoTrack?.getTrackLabel()
      setValue(label)
      AgoraRTC.getCameras().then((arr) => {
        setItems(
          arr.map((item) => ({
            label: item.label,
            value: item.label,
            deviceId: item.deviceId,
          })),
        )
      })
    }
  }, [videoTrack])

  const onChange = async (value: string) => {
    const target = items.find((item) => item.value === value)
    if (target) {
      setValue(target.value)
      if (videoTrack) {
        await videoTrack.setDevice(target.deviceId)
      }
    }
  }

  return (
    <DeviceSelect
      items={items}
      value={value}
      onChange={onChange}
      placeholder="Select a camera"
    />
  )
}
