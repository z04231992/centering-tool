import { create } from "zustand";

export interface GuidePositions {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface SideMeasurement {
  imageSrc: string | null;
  imageWidth: number;
  imageHeight: number;
  outer: GuidePositions;
  inner: GuidePositions;
  rotation: number;
}

export type GuideLayer = "outer" | "inner";

interface MeasurementState {
  activeSide: "front" | "back";
  front: SideMeasurement;
  back: SideMeasurement;
  setActiveSide: (side: "front" | "back") => void;
  setImage: (side: "front" | "back", src: string, width: number, height: number) => void;
  setGuide: (side: "front" | "back", layer: GuideLayer, guide: keyof GuidePositions, value: number) => void;
  setRotation: (side: "front" | "back", rotation: number) => void;
  reset: () => void;
}

const defaultOuter: GuidePositions = { left: 5, right: 95, top: 5, bottom: 95 };
const defaultInner: GuidePositions = { left: 15, right: 85, top: 15, bottom: 85 };

const defaultSide: SideMeasurement = {
  imageSrc: null,
  imageWidth: 0,
  imageHeight: 0,
  outer: { ...defaultOuter },
  inner: { ...defaultInner },
  rotation: 0,
};

export const useMeasurementStore = create<MeasurementState>()((set) => ({
  activeSide: "front",
  front: { ...defaultSide, outer: { ...defaultOuter }, inner: { ...defaultInner } },
  back: { ...defaultSide, outer: { ...defaultOuter }, inner: { ...defaultInner } },

  setActiveSide: (activeSide) => set({ activeSide }),

  setImage: (side, src, width, height) =>
    set((state) => ({
      [side]: {
        ...state[side],
        imageSrc: src,
        imageWidth: width,
        imageHeight: height,
        outer: { ...defaultOuter },
        inner: { ...defaultInner },
        rotation: 0,
      },
    })),

  setGuide: (side, layer, guide, value) =>
    set((state) => ({
      [side]: {
        ...state[side],
        [layer]: { ...state[side][layer], [guide]: value },
      },
    })),

  setRotation: (side, rotation) =>
    set((state) => ({
      [side]: { ...state[side], rotation },
    })),

  reset: () =>
    set({
      activeSide: "front",
      front: { ...defaultSide, outer: { ...defaultOuter }, inner: { ...defaultInner }, rotation: 0 },
      back: { ...defaultSide, outer: { ...defaultOuter }, inner: { ...defaultInner }, rotation: 0 },
    }),
}));
