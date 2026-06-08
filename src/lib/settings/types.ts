export type SettingsActionState = { ok: boolean; error?: string };

/** Default state for `useActionState` on settings forms. */
export const initialSettingsActionState: SettingsActionState = { ok: true };
