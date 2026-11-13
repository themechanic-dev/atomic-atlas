# Atomic Atlas

**by The Mechanic**

An educational simulator of what nuclear explosions do, on a real map and globe.
Pick a place, a yield and a height of burst, and Atomic Atlas shows the blast,
heat, radiation and fallout, estimates casualties as a range, and tells you how
every number was calculated and where the formula comes from.

Runs on Linux, Windows and Android with the same interface. English and Greek.
Free and open source (MIT).

> Version 1.6: one detonation, missiles and hypersonic gliders on the globe,
> accidents, water and dams, war scenarios with a general missile defence, an
> offline assistant and a voice, offline map areas with the population at 100 m,
> and the mushroom cloud in 3D, on Linux, Windows and Android.

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
- **Missiles on a 3D globe.** Choose a missile from the catalog, place where it
  is launched from and where its warheads come down, and see the range ring,
  the arc of each flight, its highest point, speed and flight time. Standard,
  lofted and depressed paths; one target per warhead for missiles that carry
  several. Hypersonic gliders fly their own way: low through the upper air,
  slowed by drag, from the published speed of the glider. Cruise missiles fly
  at their published speed, supersonic ones high up. Play the flight
  against a clock, then open any target on the city map to see the effects there.
- **Watch it happen.** Play a detonation back on the map in real time or slow
  motion: the fireball grows, the burn zones light up, the blast front sweeps
  outwards and every building changes at the moment the front reaches it.
  The fireball rises into a 3D mushroom cloud over the city that grows to the
  height and width the source gives for the yield, glowing at first, then
  red-brown, then white, until it is stabilised at about ten minutes.
- **From close up.** A small 3D scene (street, airfield, power station, nuclear
  plant, dam, fuel tanks, harbour) shows what the effects at any distance do to
  buildings, vehicles, aircraft and power lines, with the numbers of that point.
  The reactor building and the dam itself are drawn in outline only: no public
  general model gives blast damage to them, so none is shown.
- **Infrastructure.** Airports and power stations on the map; for those inside
  the blast rings, what the source reports for that kind of installation.
- **Accidents.** A release as large as Chernobyl, Fukushima, Kyshtym, Windscale
  or Three Mile Island (or a share of one), anywhere, in a wind and weather you
  choose: the dose in the first week and the first year, the caesium left on
  the ground, and how far the international criteria for iodine thyroid
  blocking, sheltering, evacuation and relocation would be reached.
- **Water.** For a burst in the sea, a lake or a lagoon: the depth of the water
  from the terrain tiles (or as you give it), how far the waves stay 10, 3 and
  1 m high, when they arrive, and the low land connected to the sea that they
  could flood. Ships in the close view are damaged by the blast as the source
  reports for merchant ships.
- **Dams.** Dams near a detonation, from the Global Dam Watch database. For any
  of them, "What if it fails?" shows the peak flow out of the breach and the way
  the water would take down the valley, with the peak falling as it goes.
- **War scenario.** Add launches from the missile simulator, each at its own
  time, and play them together on the globe with a timeline of every launch,
  re-entry and arrival. A missile defence can be switched on per phase of flight
  (boost, midcourse, terminal) with the number of shots and the chance per shot
  as parameters: the arithmetic of layered defence, not a model of any real
  system. Expected warheads and yield that get through, and the people killed and
  injured at the targets.
- **Climate and food.** The six war scenarios of Xia et al. (2022, *Nature Food*)
  with their soot, direct deaths and people without food after two years, and the
  case closest to your scenario. Nuclear winter is shown as published, not
  calculated.
- **Assistant.** Ask in English or Greek: "a 300 kt burst at the surface",
  "compare 15 kt and 1 Mt", "what does the 5 psi ring mean?". A small language
  model runs on your computer with llama.cpp (on the graphics card if there is
  one) and answers with the app's own calculations, catalog and explanations. It
  does not place ground zero, choose targets or say anything about how weapons are
  made; a filter in the app stops such questions before they reach the model.
  Downloaded from the app: small (2.7 GB) or large (5.7 GB) on a computer,
  1.3 GB or 2.7 GB on a phone. On a computer the answer appears as it is written.
- **Voice.** After each simulation a short spoken summary, in English or Greek.
  On a computer with Piper, offline, downloaded from the settings (about
  150 MB); on a phone with the phone's own voice. The app never listens.
- **"How was this calculated?"** Next to every number: the formula, the inputs,
  the source (section, figure or table) and how uncertain it is.
- **Weapons catalog.** 125 systems of all nine nuclear-armed states, in service
  and historical, each with its public source.
- **Offline areas.** Download the detailed map of the area on screen, down to
  street level; there the map then works without internet. With it comes the
  population of the area on a 100 m grid, so casualties there are counted more
  closely than on the 1 km world grid.
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
| Missile flight | Free-flight ellipse over a round, non-rotating Earth: speed, highest point and time from the distance and the climb angle | R. R. Bate, D. D. Mueller and J. E. White, *Fundamentals of Astrodynamics* (1971), chapter 6 |
| Cruise flight | Distance over the published speed of the missile; a Mach number turned into a speed with the speed of sound where it flies (near the ground, or in the stratosphere for supersonic missiles); a typical subsonic speed when none is published | the catalog source of each missile; *U.S. Standard Atmosphere, 1976* |
| Hypersonic glide | Level glide where lift and the pull of flying round the Earth carry the weight; drag slows it; height from the air density; range and time in closed form; HTV-2 test-glider figures (L/D 2.6, β 13,000 kg/m²) | C. L. Tracy and D. Wright, *Science & Global Security* 28 (2020), eqs. 1 and 7; A. J. Eggers, H. J. Allen and S. E. Neice, NACA Report 1382 (1958); *U.S. Standard Atmosphere, 1976* |
| Timing | Blast arrival from the shock-front speed along the slant range; heat pulse; cloud rise | Glasstone & Dolan (1977), eq. 3.55.2, Figs. 3.77a–b, §7.85–7.86, Table 2.12 |
| Mushroom cloud | Height and radius of the stabilised cloud, base of the head, stem radius, spread in time (cube-root scaling), colour | Glasstone & Dolan (1977), Figs. 2.16, 9.96 and 10.158c, §2.05, §2.08, §2.15–2.17, §10.158 |
| Damage to things | Houses, vehicles, parked aircraft, electricity networks, ignition of tinder | Glasstone & Dolan (1977), §5.52–5.68, §5.87–5.89, Tables 5.145, 5.153 and 7.40, §5.99–5.105 |
| Release into the air | Gaussian plume of the HotSpot codes with depletion; dose from breathing, cloud and ground; dose to the thyroid from radioiodine (effective dose coefficient over the thyroid weight, 0.05); generic criteria for protective actions, iodine thyroid blocking included | HotSpot Health Physics Codes 3.0 User's Guide (LLNL, 2013), ch. 7; ICRP Publication 119, Table G.1 and tissue weighting factors; Federal Guidance Report 12, Tables III.1 and III.3; Federal Guidance Report 11, Table 2.1; IAEA GSR Part 7, Table II.2 |
| Historical releases | Activity released per radionuclide | UNSCEAR 2008 Annexes C and D; UNSCEAR 2013 Annex A; NRPA Bulletin 8/2007 |
| Water waves | Wave height against distance in deep and shallow water; period and length of the peak wave; speed from linear wave theory; growth towards the shore and breaking | Glasstone & Dolan (1977), §6.119–6.121, Table 6.57; U.S. Army Corps of Engineers, *Coastal Engineering Manual*, Part II, chapters 1 and 4 |
| Flooding by waves | Land lower than the run-up height and connected to the sea | the above, on AWS Terrain Tiles |
| Ships | Severe and moderate damage to merchant ships from air blast | Glasstone & Dolan (1977), Fig. 5.146 (digitised), Table 5.147b |
| Dam failure | Peak outflow from the volume and depth of water; fall of the peak down the valley | D. C. Froehlich (1995), as quoted by J. C. Ackers, R. Pether and O. Tarrant, *Reservoir hazard analysis and flood mapping for contingency planning* (British Dam Society, 2006) |
| Missile defence | Phases of flight; chance of getting through layers of independent shots, (1 − p)^n per layer; length of the powered climb | elementary probability; boost times of the model ICBMs in the APS Study Group on Boost-Phase Intercept (2003) |
| Climate and food | Published results only | L. Xia, A. Robock et al., *Nature Food* 3, 586–596 (2022), Table 1 |
| Population | GHS-POP R2023A, epoch 2025, about 1 km cells (100 m in downloaded areas) | European Commission, Joint Research Centre |

### Accuracy tests

`npm test` runs 350+ checks, including the assistant's topic filter. The physics is tested against values printed in the
sources: the worked examples next to Glasstone & Dolan's charts (for example
1,000 psi at 110 ft for 1 kt at 200 ft; 4 psi out to 2,600 ft), their tables of
wind speed against overpressure, thermal partition and fallout contours, the
worked radiation examples, and the Detroit case of the Office of Technology
Assessment. A change that breaks one of them fails the build.

The missile flights are checked against the closed-form results of the source and
against an independent step-by-step simulation of the same flight (10,000 km:
about 7.2 km/s, 1,300 km high, 32 minutes). The glide model is checked against
its source and the work it quotes: from 6.1 km/s it reaches about 7,500 km, from
6 km/s its speed halves after about 6,000 km, and it flies at about 50 km at
6 km/s; the air density is checked against the tables of the 1976 standard
atmosphere.

The water waves are checked against the waves measured at the Crossroads Baker
test (Glasstone & Dolan Table 6.57): heights within a factor of 2, first arrival
within 15 %.

The plume model reproduces the worked example of the HotSpot guide (krypton-85
from 10 m in unstable air) at every distance from 30 m to 80 km within the
rounding of the printed table.

Where the sources disagree or are only charts, the code says so. The heat model,
for instance, reproduces the transmittance chart within 0.06 and the range chart
within 7 % up to 1 Mt, and runs up to 24 % long at 10 Mt, where the two charts of
the book differ.

## Data and services

- Maps: [OpenFreeMap](https://openfreemap.org) (OpenMapTiles schema, data from
  OpenStreetMap contributors). Built-in map: Natural Earth. Satellite images:
  Sentinel-2 cloudless by EOX. Terrain: Mapzen / AWS Terrain Tiles. The globe is
  drawn with CesiumJS and carries its own small world image.
- Infrastructure: airports from OurAirports (public domain), power stations from
  the Global Power Plant Database 1.3 of the World Resources Institute (CC BY 4.0).
- Dams: Global Dam Watch database 1.0 (Lehner et al. 2024, CC BY 4.0); dams with
  a known height and at least 1 million m³ of water.
- Weather: [Open-Meteo](https://open-meteo.com), wind at 10 m and at 850, 500 and
  250 hPa. Only the coordinates of the burst are sent.
- Assistant (optional download): llama.cpp (ggml-org, release b12308) with
  Qwen3.5-4B or Qwen3.5-9B in GGUF form from HuggingFace. Voice (optional
  download): Piper with the voices Joy (Greek) and Lessac (English) from
  HuggingFace `rhasspy/piper-voices`.
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
app/        the shared web UI (TypeScript, Preact, MapLibre GL, CesiumJS, Three.js)
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
