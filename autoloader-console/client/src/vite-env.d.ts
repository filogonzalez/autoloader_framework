/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** UC (Delta) catalog baked at build time by client/vite.config.ts (define),
   *  derived from var.uc_catalog via scripts/uc-catalog.mjs. */
  readonly VITE_UC_CATALOG: string;
}
