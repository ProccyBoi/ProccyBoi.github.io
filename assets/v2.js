/* V2's small shared controller. All page content is available without JavaScript. */
(() => {
  'use strict';
  document.body.classList.add('v2-ready');
  document.querySelectorAll('[data-v2-year]').forEach(node => { node.textContent = new Date().getFullYear(); });
  const menu = document.querySelector('[data-v2-menu]');
  const nav = document.querySelector('[data-v2-nav]');
  if (menu && nav) {
    const setOpen = open => {
      menu.setAttribute('aria-expanded', String(open));
      menu.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
      nav.dataset.open = String(open);
    };
    menu.addEventListener('click', () => setOpen(menu.getAttribute('aria-expanded') !== 'true'));
    nav.addEventListener('click', event => { if (event.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') { setOpen(false); menu.focus(); }
    });
    document.addEventListener('click', event => { if (!event.target.closest('.v2-header')) setOpen(false); });
    matchMedia('(min-width:541px)').addEventListener('change', event => { if (event.matches) setOpen(false); });
  }
  const explorer = document.querySelector('[data-system-explorer]');
  if (!explorer) return;
  explorer.querySelectorAll('button').forEach(button => { button.disabled = false; });
  const systems = {
    skylabs: {
      name: 'Skylabs', href: '/v2/projects/skylabs/', note: '40 Hz onboard logging · live subset up to 10 Hz',
      steps: [
        ['Sense','⊕','Aircraft sensors','IMU + GNSS + air data','A flight starts with measurements.','The aircraft board brings together inertial, GNSS, pressure and airspeed inputs. Sensor presence and validity travel with the data, so missing measurements don’t become convincing numbers.'],
        ['Record','▤','Onboard logger','STM32G474 + microSD','Keep the complete record onboard.','A 40 Hz binary log preserves the aircraft record independently of the radio link. Eight records are written per SD transaction, with a sync once per second.'],
        ['Transmit','⌁','Radio link','915 MHz LoRa','Send what the ground needs.','A live subset travels over 915 MHz LoRa at up to 10 Hz. Keeping this separate from the onboard log lets the ground view stay useful without making the radio responsible for the full flight record.'],
        ['Understand','↗','Ground + replay','Live view & flight review','One flight. More ways to inspect it.','The ESP32 ground station maintains a second record and a live dashboard. After the flight, the browser review tool synchronizes plots, a map and a 3D replay for closer inspection.']
      ]
    },
    tramtrace: {
      name: 'TramTrace', href: '/v2/projects/tramtrace/', note: '116 RGB pixels · L1–L4 · ESP32-WROOM-32E',
      steps: [
        ['Fetch','⌁','Live positions','Vehicle-position service','Start with the city outside.','The vehicle-position service supplies live light-rail data for Sydney and Parramatta. The physical display makes that changing network readable at a glance.'],
        ['Locate','⊕','Route matching','L1, L2, L3 and L4','Translate location into a route.','Vehicle positions are matched to the light-rail network. The service and display logic connect a geographic position to its place on the printed map.'],
        ['Drive','▤','Embedded control','ESP32 + five LED chains','Make the electronics fit the map.','The ESP32 drives 116 WS2812C-2020 RGB pixels across five electrical data chains. The PCB carries the controller, routing, station labels and the visible network itself.'],
        ['Display','↗','Physical network','116 RGB pixels','A live system, made tangible.','Each light has a place in the network. The board turns an abstract feed into an object you can read from across the room, with all four light-rail lines on one surface.']
      ]
    },
    framework: {
      name: 'Framework', href: '/v2/projects/framework-expansion-card/', note: '0.6 mm PCB · ESP32-S3-MINI-1 · Framework expansion bay',
      steps: [
        ['Connect','↗','Laptop interface','Direct USB-C mating','Let the form factor do the work.','A 0.6 mm PCB meets the laptop’s USB-C connector directly. Board thickness, connector alignment and the bay outline become electrical design decisions as well as mechanical ones.'],
        ['Program','▤','USB bridge','CH340K + boot/reset','A development board, integrated.','The CH340K provides the USB-to-UART interface, with a BC817 pair for automatic boot and reset. The programming interface is part of the expansion card.'],
        ['Process','⊕','ESP32-S3','Embedded application','Put the controller in the bay.','An ESP32-S3-MINI-1 brings the microcontroller and radio into the laptop’s expansion-card format. The populated black PCB fits inside a clear enclosure.'],
        ['Radio','⌁','Wireless interface','Antenna keep-out','Leave room for the invisible part.','The antenna end of the ESP32 module remains unobstructed. Mechanical fit alone is not enough: the enclosure and component placement must also respect the radio.']
      ]
    }
  };
  let activeSystem = 'skylabs';
  let activeStep = 0;
  const projectButtons = [...explorer.querySelectorAll('[data-system]')];
  const steps = [...explorer.querySelectorAll('[data-system-step]')];
  const updateDetail = () => {
    const step = systems[activeSystem].steps[activeStep];
    steps.forEach((button, index) => button.setAttribute('aria-pressed', String(index === activeStep)));
    explorer.querySelector('[data-system-detail-label]').textContent = `0${activeStep + 1} / ${step[0]}`;
    explorer.querySelector('[data-system-detail-title]').textContent = step[4];
    explorer.querySelector('[data-system-detail-text]').textContent = step[5];
  };
  projectButtons.forEach(button => button.addEventListener('click', () => {
    activeSystem = button.dataset.system;
    activeStep = 0;
    const system = systems[activeSystem];
    projectButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    explorer.querySelector('[data-system-diagram]').setAttribute('aria-label', `${system.name} signal path`);
    steps.forEach((item, index) => {
      const step = system.steps[index];
      item.querySelector('.v2-signal-number').textContent = `0${index + 1} / ${step[0]}`;
      item.querySelector('.v2-signal-symbol').textContent = step[1];
      item.querySelector('strong').textContent = step[2];
      item.querySelector('.v2-signal-small').textContent = step[3];
    });
    explorer.querySelector('[data-system-note]').textContent = system.note;
    const link = explorer.querySelector('[data-system-link]');
    link.href = system.href;
    link.replaceChildren(document.createTextNode(`Inside ${system.name} `));
    const arrow = document.createElement('span'); arrow.setAttribute('aria-hidden','true'); arrow.textContent = '↗'; link.append(arrow);
    updateDetail();
    explorer.dispatchEvent(new CustomEvent('v2:system-change', {bubbles:true,detail:{project:true}}));
  }));
  steps.forEach((button, index) => button.addEventListener('click', () => {
    activeStep = index; updateDetail();
    explorer.dispatchEvent(new CustomEvent('v2:system-change', {bubbles:true,detail:{project:false}}));
  }));
})();
