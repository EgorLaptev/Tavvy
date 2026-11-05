export const VERSION_NAMES = Object.freeze({
  "0.2.0": "Tabby Sparrow",
  "0.2.1": "Sleepy Tabosaurus",
  "0.2.2": "Pajama Tapir",
  "0.2.3": "Sleepy Raccoon",
  "0.2.4": "Lilac Platypus",
  "0.2.5": "Curious Capybara",
  "0.2.6": "Cosmic Wombat",
  "0.2.7": "Dancing Red Panda",
  "0.2.8": "Wandering Otter",
  "0.2.9": "Bouncy Badger",
});

export function versionLabel(version) {
  const name = VERSION_NAMES[version];
  return name ? `${version} · ${name}` : version;
}
