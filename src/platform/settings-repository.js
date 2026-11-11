import { normalizeSettings } from "../domain/settings.js";
const KEY = "tavvy:settings:v1";
const LEGACY_KEY = "tavvy-mock-settings";
export function createSettingsRepository(storage) {
    return {
        read() {
            try {
                return normalizeSettings(
                    JSON.parse(
                        storage.getItem(KEY) ??
                            storage.getItem(LEGACY_KEY) ??
                            "null",
                    ),
                );
            } catch {
                return normalizeSettings(null);
            }
        },
        write(settings) {
            storage.setItem(KEY, JSON.stringify(normalizeSettings(settings)));
        },
    };
}
