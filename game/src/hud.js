// GOBLOK OPENFIRE — the HUD. Plain DOM over the canvas: health and armour,
// ammunition, money, the round clock and score, a kill feed, round banners,
// the buy menu, a Tab scoreboard and a canvas minimap fed by the same wall
// list the simulation uses. Text nodes are only rewritten when their value
// changes, so the HUD costs nothing on a quiet frame.

import { TEAM_NAME, WEAPONS, GRENADES, ARMOR_PRICE } from './config.js';
import { WALLS, SITES } from './map.js';

const $ = (id) => document.getElementById(id);

export function createHUD(game) {
  const el = {
    health: $('health-num'), healthFill: $('health-fill'), armorFill: $('armor-fill'),
    ammoMag: $('ammo-mag'), ammoReserve: $('ammo-reserve'), weaponName: $('weapon-name'),
    money: $('money'), timer: $('timer'), roundLabel: $('round-label'),
    scoreUs: $('score-us'), scoreThem: $('score-them'),
    aliveUs: $('alive-us'), aliveThem: $('alive-them'),
    killfeed: $('killfeed'), bannerWrap: $('banner-wrap'), bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
    buyMenu: $('buymenu'), buyMoney: $('buy-money'), buyItems: $('buy-items'), buyTimer: $('buy-timer'),
    scoreboard: $('scoreboard'), scoreRows: $('score-rows'),
    minimap: $('minimap'), dmg: $('dmgflash'), blind: $('blindflash'), scope: $('scope'),
    channelWrap: $('channel-wrap'), channelFill: $('channel-fill'), channelLabel: $('channel-label'),
    crosshair: $('crosshair'), hitmarker: $('hitmarker'),
    bombStatus: $('bomb-status'), hint: $('hint'), grenades: $('grenade-count'),
    menu: $('menu'), endMenu: $('endmenu'), endTitle: $('end-title'), endSub: $('end-sub'),
  };
  const mapCtx = el.minimap.getContext('2d');
  const cache = new Map();
  const setText = (node, key, value) => {
    if (cache.get(key) !== value) { cache.set(key, value); node.textContent = value; }
  };

  // Build the buy menu once; main.js owns the wallet and loadout, the HUD
  // only reports clicks through game.onBuy.
  const BUY_ITEMS = [
    { key: 'marauder', label: WEAPONS.marauder.label, price: WEAPONS.marauder.price, hotkey: '1' },
    { key: 'longbow', label: WEAPONS.longbow.label, price: WEAPONS.longbow.price, hotkey: '2' },
    { key: 'verdict', label: WEAPONS.verdict.label, price: WEAPONS.verdict.price, hotkey: '3' },
    { key: 'armor', label: 'Kevlar Vest + Helm', price: ARMOR_PRICE, hotkey: '4' },
    { key: 'flash', label: GRENADES.flash.label, price: GRENADES.flash.price, hotkey: '5' },
    { key: 'shard', label: GRENADES.shard.label, price: GRENADES.shard.price, hotkey: '6' },
  ];
  for (const item of BUY_ITEMS) {
    const b = document.createElement('button');
    b.className = 'buy-item';
    b.dataset.key = item.key;
    b.innerHTML = `<span class="buy-key">${item.hotkey}</span><span class="buy-label">${item.label}</span><span class="buy-price">$${item.price}</span>`;
    b.addEventListener('click', () => game.onBuy && game.onBuy(item.key));
    el.buyItems.appendChild(b);
  }

  let bannerUntil = 0;
  let hitUntil = 0;

  const hud = {
    el,
    banner(title, sub = '', ms = 2600) {
      el.bannerTitle.textContent = title;
      el.bannerSub.textContent = sub;
      el.bannerWrap.hidden = false;
      bannerUntil = performance.now() + ms;
    },
    killfeed(html) {
      const row = document.createElement('div');
      row.className = 'kf-row';
      row.innerHTML = html;
      el.killfeed.appendChild(row);
      while (el.killfeed.children.length > 5) el.killfeed.firstChild.remove();
      setTimeout(() => row.remove(), 4200);
    },
    hitmark(head) {
      el.hitmarker.classList.toggle('head', !!head);
      el.hitmarker.style.opacity = '1';
      hitUntil = performance.now() + 110;
    },
    setChannel(label, frac) {
      if (frac === null) { el.channelWrap.hidden = true; return; }
      el.channelWrap.hidden = false;
      el.channelLabel.textContent = label;
      el.channelFill.style.width = `${Math.round(frac * 100)}%`;
    },
    setBlind(strength) {
      el.blind.style.opacity = String(Math.min(1, strength));
    },
    setScope(on) {
      el.scope.hidden = !on;
    },
    damageFlash() {
      el.dmg.style.opacity = '0.55';
      setTimeout(() => { el.dmg.style.opacity = '0'; }, 130);
    },
    showBuy(show) {
      el.buyMenu.hidden = !show;
    },
    showScoreboard(show) {
      el.scoreboard.hidden = !show;
      if (!show) return;
      const rows = game.actors.filter((a) => !a.benched).sort((a, b) => (b.kills - a.kills) || (a.deaths - b.deaths));
      el.scoreRows.innerHTML = rows.map((a) => `
        <tr class="${a.team === game.player.team ? 'us' : 'them'}${a.alive ? '' : ' dead'}">
          <td>${a.isPlayer ? '★ ' : ''}${a.name}</td><td>${TEAM_NAME[a.team]}</td>
          <td>${a.kills}</td><td>${a.deaths}</td><td>$${a.money}</td>
        </tr>`).join('');
    },
    showMenu(show) { el.menu.hidden = !show; },
    showEnd(title, sub) {
      el.endTitle.textContent = title;
      el.endSub.textContent = sub;
      el.endMenu.hidden = false;
    },
    hideEnd() { el.endMenu.hidden = true; },

    update(game, now) {
      const p = game.player;
      const loadout = p.loadout;
      const state = loadout.owned[loadout.current];
      setText(el.health, 'hp', String(Math.max(0, Math.ceil(p.hp))));
      el.healthFill.style.width = `${Math.max(0, p.hp)}%`;
      el.healthFill.style.background = p.hp > 50 ? 'var(--teal)' : p.hp > 25 ? 'var(--amber)' : 'var(--red)';
      el.armorFill.style.width = loadout.armor ? '100%' : '0%';
      setText(el.ammoMag, 'mag', loadout.reloading > 0 ? '—' : String(state.mag));
      setText(el.ammoReserve, 'res', `/ ${state.reserve}`);
      setText(el.weaponName, 'wep', WEAPONS[loadout.current].label + (loadout.scoped ? ' · scoped' : ''));
      setText(el.money, 'money', `$${p.money}`);
      setText(el.buyMoney, 'bmoney', `$${p.money}`);
      if (game.phase === 'buy') {
        setText(el.buyTimer, 'btimer', `Gear up — barriers drop in ${Math.max(0, Math.ceil(game.phaseTimeLeft))}s. Click an item, or deploy and use its number key.`);
      }
      setText(el.grenades, 'nades', `Flash ×${loadout.grenades.flash} [F] · Shard ×${loadout.grenades.shard} [G]`);

      const bombState = game.bomb ? game.bomb.state : 'none';
      const clock = bombState === 'planted' ? game.bomb.timeLeft : game.phaseTimeLeft;
      const t = Math.max(0, Math.ceil(clock));
      setText(el.timer, 'timer', `${(t / 60) | 0}:${String(t % 60).padStart(2, '0')}`);
      el.timer.classList.toggle('low', t <= 10 && game.phase === 'live');
      setText(el.roundLabel, 'round', `Round ${game.round} · First to 9`);
      setText(el.scoreUs, 'sus', String(game.score[p.team]));
      setText(el.scoreThem, 'sthem', String(game.score[1 - p.team]));
      const aliveUs = game.actors.filter((a) => a.team === p.team && a.alive).length;
      const aliveThem = game.actors.filter((a) => a.team !== p.team && a.alive).length;
      setText(el.aliveUs, 'aus', '●'.repeat(aliveUs) + '○'.repeat(5 - aliveUs));
      setText(el.aliveThem, 'athem', '●'.repeat(aliveThem) + '○'.repeat(5 - aliveThem));

      if (bombState === 'planted') {
        el.bombStatus.hidden = false;
        setText(el.bombStatus, 'bomb', `⚠ CORE PLANTED — SITE ${game.bomb.site} · ${Math.ceil(game.bomb.timeLeft)}s`);
      } else if (bombState === 'carried' && p.carryCore) {
        el.bombStatus.hidden = false;
        setText(el.bombStatus, 'bomb', '◆ You carry the Core — plant at A or B [hold E]');
      } else {
        el.bombStatus.hidden = true;
      }

      // Hint line: the one contextual action that matters right now.
      let hint = '';
      if (game.phase === 'buy') hint = 'Buy phase — press B or click to equip. Barriers drop soon.';
      else if (game.phase === 'live' && p.alive && p.carryCore && game.playerInSite) hint = 'Hold E to plant the Core';
      else if (game.phase === 'live' && !p.alive) hint = 'You are down — watching your team.';
      setText(el.hint, 'hint', hint);

      // Crosshair spread follows the weapon's real inaccuracy.
      const spreadPx = 4 + (loadout.bloom + (game.playerSpread ?? 0)) * 260;
      el.crosshair.style.setProperty('--sp', `${spreadPx.toFixed(1)}px`);
      el.crosshair.style.opacity = loadout.scoped ? '0' : '1';

      if (bannerUntil && performance.now() > bannerUntil) { el.bannerWrap.hidden = true; bannerUntil = 0; }
      if (hitUntil && performance.now() > hitUntil) { el.hitmarker.style.opacity = '0'; hitUntil = 0; }
      drawMinimap(game, mapCtx);
    },
  };

  function drawMinimap(game, g) {
    const W = el.minimap.width;
    const H = el.minimap.height;
    const sx = W / 64;
    const sz = H / 48;
    const px = (x) => (x + 32) * sx;
    const pz = (z) => (z + 24) * sz;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(16,20,24,0.82)';
    g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(140,150,160,0.5)';
    for (const w of WALLS) {
      if (w.kind === 'crate') continue;
      g.fillRect(px(w.x0), pz(w.z0), (w.x1 - w.x0) * sx, (w.z1 - w.z0) * sz);
    }
    for (const site of SITES) {
      g.strokeStyle = site.id === 'A' ? '#e07b39' : '#3fa7a0';
      g.lineWidth = 1.4;
      g.beginPath();
      g.arc(px(site.x), pz(site.z), site.r * sx, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = g.strokeStyle;
      g.font = 'bold 9px system-ui';
      g.fillText(site.id, px(site.x) - 3, pz(site.z) + 3);
    }
    if (game.bomb && game.bomb.state === 'planted') {
      g.fillStyle = '#ff5347';
      g.beginPath();
      g.arc(px(game.bomb.pos.x), pz(game.bomb.pos.z), 3.4, 0, Math.PI * 2);
      g.fill();
    }
    for (const a of game.actors) {
      if (!a.alive) continue;
      const mine = a.team === game.player.team;
      const spotted = a.spottedUntil > game.time;
      if (!mine && !spotted) continue;
      g.fillStyle = a.isPlayer ? '#ffffff' : mine ? '#7fd4c9' : '#ff8a5c';
      g.beginPath();
      g.arc(px(a.pos.x), pz(a.pos.z), a.isPlayer ? 3 : 2.4, 0, Math.PI * 2);
      g.fill();
      if (a.isPlayer) {
        g.strokeStyle = '#ffffff';
        g.beginPath();
        g.moveTo(px(a.pos.x), pz(a.pos.z));
        g.lineTo(px(a.pos.x) - Math.sin(a.yaw) * 7, pz(a.pos.z) - Math.cos(a.yaw) * 7);
        g.stroke();
      }
    }
  }

  return hud;
}
