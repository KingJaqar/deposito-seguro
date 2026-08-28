// src/constants/animations.ts

export const StaggerConfig = {
  initialDelay: 0,
  itemDelay: 60,
} as const;

export const Durations = {
   instant: 0,
   fast: 150,
   normal: 250,
   slow: 350,
   slower: 500,
   slowest: 750,
   spring: 400,
   layout: 300,
   stagger: 60,
   staggerFade: 80,
   tabSwitch: 280,
   modalEnter: 380,
   modalExit: 300,
   sheetEnter: 420,
   sheetExit: 320,
   fab: 300,
   ripple: 200,
   reveal: 400,
   parallax: 50,
   toggle: 180,
 } as const;

export const EasingCurves = {
   standard: [0.4, 0.0, 0.2, 1] as const,
   decelerate: [0.0, 0.0, 0.2, 1] as const,
   accelerate: [0.4, 0.0, 1, 1] as const,
   emphasized: [0.2, 0.0, 0.0, 1] as const,
   sharp: [0.4, 0.0, 0.6, 1] as const,
   bouncy: [0.34, 1.56, 0.64, 1] as const,
   airbnb: [0.25, 0.1, 0.25, 1] as const,
   airbnbDecel: [0.0, 0.0, 0.2, 1] as const,
   airbnbAccel: [0.4, 0.0, 1, 1] as const,
   fab: [0.175, 0.885, 0.32, 1.275] as const,
   modal: [0.32, 0.72, 0, 1] as const,
   easeOut: [0.2, 0.0, 0.2, 1] as const,
   easeIn: [0.4, 0.0, 1, 1] as const,
 } as const;