"use client";

import { Component, type ReactNode } from "react";

type ErrorBoundaryProps = { fallback: ReactNode; children: ReactNode };

/** Keeps a failing widget from taking down the whole page. */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
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
