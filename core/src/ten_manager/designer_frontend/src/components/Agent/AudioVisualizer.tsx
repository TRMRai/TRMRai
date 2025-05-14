import { IMicrophoneAudioTrack, IRemoteAudioTrack } from "agora-rtc-react";
import * as React from "react";

export const normalizeFrequencies = (frequencies: Float32Array) => {
  const normalizeDb = (value: number) => {
    const minDb = -100;
    const maxDb = -10;
    let db = 1 - (Math.max(minDb, Math.min(maxDb, value)) * -1) / 100;
    db = Math.sqrt(db);

    return db;
  };

  // Normalize all frequency values
  return frequencies.map((value) => {
    if (value === -Infinity) {
      return 0;
    }
    return normalizeDb(value);
  });
};

export const useMultibandTrackVolume = (
  track?: IMicrophoneAudioTrack | IRemoteAudioTrack | null,
  bands: number = 5,
  loPass: number = 100,
  hiPass: number = 600
) => {
  const [frequencyBands, setFrequencyBands] = React.useState<Float32Array[]>([]);

  React.useEffect(() => {
    if (!track) {
      return setFrequencyBands(new Array(bands).fill(new Float32Array(0)));
    }

    const ctx = new AudioContext();
    let finTrack =
      track instanceof MediaStreamTrack ? track : track.getMediaStreamTrack();
    const mediaStream = new MediaStream([finTrack]);
    const source = ctx.createMediaStreamSource(mediaStream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;

    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Float32Array(bufferLength);

    const updateVolume = () => {
      analyser.getFloatFrequencyData(dataArray);
      let frequencies: Float32Array = new Float32Array(dataArray.length);
      for (let i = 0; i < dataArray.length; i++) {
        frequencies[i] = dataArray[i];
      }
      frequencies = frequencies.slice(loPass, hiPass);

      const normalizedFrequencies = normalizeFrequencies(frequencies);
      const chunkSize = Math.ceil(normalizedFrequencies.length / bands);
      const chunks: Float32Array[] = [];
      for (let i = 0; i < bands; i++) {
        chunks.push(
          normalizedFrequencies.slice(i * chunkSize, (i + 1) * chunkSize)
        );
      }

      setFrequencyBands(chunks);
    };

    const interval = setInterval(updateVolume, 10);

    return () => {
      source.disconnect();
      clearInterval(interval);
    };
  }, [track, loPass, hiPass, bands]);

  return frequencyBands;
};

export interface AudioVisualizerProps {
  type: "agent" | "user"
  frequencies: Float32Array[]
  gap: number
  barWidth: number
  minBarHeight: number
  maxBarHeight: number
  borderRadius: number
}

export default function AudioVisualizer(props: AudioVisualizerProps) {
  const {
    frequencies,
    gap,
    barWidth,
    minBarHeight,
    maxBarHeight,
    borderRadius,
    type,
  } = props

  const summedFrequencies = frequencies.map((bandFrequencies) => {
    const sum = bandFrequencies.reduce((a, b) => a + b, 0)
    if (sum <= 0) {
      return 0
    }
    return Math.sqrt(sum / bandFrequencies.length)
  })

  return (
    <div
      className={`flex items-center justify-center`}
      style={{ gap: `${gap}px` }}
    >
      {summedFrequencies.map((frequency, index) => {
        const style = {
          height:
            minBarHeight + frequency * (maxBarHeight - minBarHeight) + "px",
          borderRadius: borderRadius + "px",
          width: barWidth + "px",
          transition:
            "background-color 0.35s ease-out, transform 0.25s ease-out",
          // transform: transform,
          backgroundColor: type === "agent" ? "#0888FF" : "#EAECF0",
        }

        return <span key={index} style={style} />
      })}
    </div>
  )
}
