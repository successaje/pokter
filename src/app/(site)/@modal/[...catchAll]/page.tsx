/*
 * Navigating anywhere else closes the compare sheet: a parallel slot keeps
 * showing what it last matched on a client navigation, so every other
 * route has to match something that renders nothing.
 */
export default function CatchAll() {
  return null;
}
