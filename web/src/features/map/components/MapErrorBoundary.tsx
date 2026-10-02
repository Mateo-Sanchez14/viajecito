"use client";
import { Component, type ReactNode } from "react";
/** A chunk or Leaflet failure must never hide the independent, accessible places list. */
export class MapErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
