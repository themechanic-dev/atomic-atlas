# Atomic Atlas

**by The Mechanic**

An educational simulator of what nuclear explosions do, on a real map and globe.
Pick a place, a yield and a height of burst, and Atomic Atlas shows the blast,
heat, radiation and fallout, estimates casualties as a range, and tells you how
every number was calculated and where the formula comes from.

Runs on Linux, Windows and Android with the same interface. English and Greek.
Free and open source (MIT).

> Version 0.1 is the first stage: one detonation at a time. Missiles and
> trajectories, infrastructure, reactor accidents, water effects, a war
> timeline and an offline assistant follow in later versions.

## What it does

- **Map and globe.** A globe when zoomed out, streets and 3D buildings when
  zoomed in. Buildings are coloured by the damage zone they stand in. A small
  world map is built in, so the app also works without internet.
- **One detonation.** Any yield from 10 tons to 100 megatons; air burst at the
  height that maximises damage to houses, surface burst, or a height you choose.
- **Effects by distance.** Fireball, four blast rings (20, 5, 2 and 1 psi),
  first-, second- and third-degree burns, and the initial radiation dose.
- **Fallout.** For bursts near the ground: the pattern of radioactive fallout
  along the wind, from live weather at four heights or a wind you set.
- **Casualties.** People killed and injured, as a range, from the population
  that lives inside each zone.
- **"How was this calculated?"** Next to every number: the formula, the inputs,
  the source (section, figure or table) and how uncertain it is.
- **Weapons catalog.** 46 systems of all nine nuclear-armed states, in service
  and historical, each with its public source.
- **Settings.** English or Greek, kilometres or miles, °C or °F, dark or light,
  the map source and the weather source.

Right-click (or long-press) any point on the map to read the effects there.

## What it is not

Atomic Atlas simulates **effects**, with public, unclassified models. It does not
choose or rank targets, it holds nothing about how weapons are built or operated,
and its catalog has no accuracy or guidance data. It is a tool for understanding,
in the tradition of Glasstone & Dolan's *The Effects of Nuclear Weapons*.

Results are estimates from simplified models, not predictions. Real terrain,
buildings, weather and people do not behave like a formula.

## The models and their sources

| Effect | Model | Source |
|---|---|---|
| Blast | Peak overpressure against distance and height of burst, cube-root scaling | H. L. Brode, *Airblast From Nuclear Bursts: Analytic Approximations* (1986); Glasstone & Dolan (1977), Figs. 3.73a–c, §3.55, §3.61 |
| Heat | Radiant exposure with a two-layer atmosphere fitted to the transmittance chart; burn thresholds by yield | Glasstone & Dolan (1977), eq. 7.96.2, Tables 7.88 and 7.101, Figs. 7.98 and 12.65 |
| Initial radiation | Neutrons, secondary gamma rays and fission-product gamma rays | Glasstone & Dolan (1977), Figs. 8.123, 8.127, 8.130, 8.132 |
| Fireball | Radius at breakaway, doubled | Glasstone & Dolan (1977), §2.127 |
| Fallout | WSEG-10 pattern; cloud heights; effective wind; t^-1.2 decay | D. W. Hanifen, *Documentation and Analysis of the WSEG-10 Fallout Prediction Model* (1980); Glasstone & Dolan (1977), Fig. 9.96, §9.84, eqs. 9.147.1 and 9.150.1 |
| Casualties | Share of people killed and injured per overpressure zone; burns for those in sight of the fireball; lethality of radiation dose | U.S. Office of Technology Assessment, *The Effects of Nuclear War* (1979) |
| Population | GHS-POP R2023A, epoch 2025, about 1 km cells | European Commission, Joint Research Centre |

### Accuracy tests

`npm test` runs 180+ checks. The physics is tested against values printed in the
sources: the worked examples next to Glasstone & Dolan's charts (for example
1,000 psi at 110 ft for 1 kt at 200 ft; 4 psi out to 2,600 ft), their tables of
wind speed against overpressure, thermal partition and fallout contours, the
worked radiation examples, and the Detroit case of the Office of Technology
Assessment. A change that breaks one of them fails the build.

Where the sources disagree or are only charts, the code says so. The heat model,
for instance, reproduces the transmittance chart within 0.06 and the range chart
within 7 % up to 1 Mt, and runs up to 24 % long at 10 Mt, where the two charts of
the book differ.

## Data and services

- Maps: [OpenFreeMap](https://openfreemap.org) (OpenMapTiles schema, data from
  OpenStreetMap contributors). Built-in map: Natural Earth. Satellite images:
  Sentinel-2 cloudless by EOX. Terrain: Mapzen / AWS Terrain Tiles.
- Weather: [Open-Meteo](https://open-meteo.com), wind at 10 m and at 850, 500 and
  250 hPa. Only the coordinates of the burst are sent.
- Nothing needs an account or a key. With the built-in map and a manual wind the
  app makes no network requests at all.

## Build from source

Requirements: Node.js 22 or newer. For Android also JDK 21 and the Android SDK.

```sh
npm install
npm run check         # type check and tests
npm run dev           # the web UI in a browser, with reload
npm run build         # web UI and desktop shell into dist/
npm start             # run the desktop app
```

The population grid is generated from the GHS-POP download (484 MB) and is not
in the repository:

```sh
node scripts/build-population.mjs path/to/GHS_POP_E2025_GLOBE_R2023A_4326_30ss_V1_0.tif app/public/data/population
```

Without it the app works, and says that casualties cannot be estimated.

Packages:

```sh
npm run dist:linux    # .deb in release/
npm run dist:win      # Setup.exe in release/ (also builds on Linux, no Wine needed)
npm run android:apk   # debug APK in release/
```

### Layout

```
app/        the shared web UI (TypeScript, Preact, MapLibre GL)
physics/    the models: pure functions, no UI, with the accuracy tests
data/       weapons catalog and historical scenarios, with sources
desktop/    Electron shell (Linux, Windows)
mobile/     Capacitor shell (Android)
installer/  icons and packaging helpers
scripts/    build tools
```

The physics has no dependency on the interface: the same functions run in the
desktop app, on the phone and in the tests.

## License

MIT. See [LICENSE](LICENSE).
