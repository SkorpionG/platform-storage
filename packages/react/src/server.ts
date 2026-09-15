/*
  No `"use client"` here, deliberately. This entry is what a Server Component imports, and a directive would turn everything it exports into a client reference.
*/
export { readDeclaredValue } from "./store/declared";
