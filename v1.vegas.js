document.addEventListener("DOMContentLoaded", () => {
  // Rules config (defaults requested)
  const DEALER_HITS_SOFT_17 = true;      // H17 default
  const DOUBLE_AFTER_SPLIT = true;       // DAS default (split not implemented yet)

  const COUNT_VALUES = {
    2: 1, 3: 1, 4: 1, 5: 1, 6: 1,
    7: 0, 8: 0, 9: 0,
    10: -1, J: -1, Q: -1, K: -1, A: -1
  };

  const el = (id) => document.getElementById(id);

  const fmtMoney = (n) =>
    n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // State
  let shoe = [];
  let runningCount = 0;

  let decks = 6;
  let shuffleAfter = 4;

  let bankroll = 1000;

  let bet = [];
  let betTotal = 0;
  let lastBet = [];
  let lastBetTotal = 0;

  let player = [];
  let dealer = [];
  let hole = null;

  let inPlay = false;

  // Session stats
  const stats = { hands: 0, wins: 0, losses: 0, pushes: 0, net: 0 };

  // Mistake tracker
  let mistakes = 0;

  // Elements
  const dealerHandEl = el("dealer-hand");
  const playerHandEl = el("player-hand");
  const dealerTotalEl = el("dealer-total");
  const playerTotalEl = el("player-total");

  const betStackEl = el("bet-stack");
  const chipTrayEl = el("chip-tray");

  const bankrollEl = el("bankroll");
  const countEl = el("count");
  const trueCountEl = el("true-count");

  const handsEl = el("hands");
  const winsEl = el("wins");
  const lossesEl = el("losses");
  const pushesEl = el("pushes");
  const netEl = el("net");

  const dealBtn = el("deal");
  const hitBtn = el("hit");
  const standBtn = el("stand");
  const doubleBtn = el("double");
  const splitBtn = el("split"); // placeholder

  const strategyToggle = el("strategy-toggle");
  const rebetToggle = el("rebet-toggle");
  const strategyHintEl = el("strategy-hint");

  const outcomePanel = el("outcome-panel");
  const outcomeText = el("outcome-text");
  const outcomeAmount = el("outcome-amount");

  const mistakesEl = el("mistakes");
  const mistakeLastEl = el("mistake-last");

  init();

  function init() {
    buildSelectors();
    buildShoe();
    buildChips();
    updateBankrollUI();
    updateStatsUI();
    updateCountUI();
    updateStrategy();
    updateMistakesUI("—");
    resetButtons();

    strategyToggle.onchange = updateStrategy;
    rebetToggle.onchange = () => {
      // If toggled on while idle and we have a last bet, start the loop
      if (rebetToggle.checked && !inPlay && lastBetTotal > 0) {
        // restore + autodeal
        bet = [...lastBet];
        betTotal = lastBetTotal;
        renderBet();
        setTimeout(() => tryAutoDeal(), 250);
      }
    };
  }

  /* ---------- Selectors ---------- */
  function buildSelectors() {
    const deckSel = el("deck-count");
    const shuffleSel = el("shuffle-point");

    deckSel.innerHTML = "";
    shuffleSel.innerHTML = "";

    for (let i = 1; i <= 8; i++) {
      deckSel.innerHTML += `<option value="${i}">${i}</option>`;
      shuffleSel.innerHTML += `<option value="${i}">${i}</option>`;
    }

    deckSel.value = decks;
    shuffleSel.value = shuffleAfter;

    deckSel.onchange = (e) => {
      decks = +e.target.value;
      buildShoe();
      hardResetToBetting();
    };

    shuffleSel.onchange = (e) => {
      shuffleAfter = +e.target.value;
    };
  }

  /* ---------- Shoe ---------- */
  function buildShoe() {
    shoe = [];
    const suits = ["♠", "♥", "♦", "♣"];
    const vals = ["A", 2, 3, 4, 5, 6, 7, 8, 9, 10, "J", "Q", "K"];

    for (let d = 0; d < decks; d++) {
      for (const s of suits) for (const v of vals) shoe.push({ s, v });
    }

    shoe.sort(() => Math.random() - 0.5);
    runningCount = 0;
    updateCountUI();
  }

  function maybeReshuffle() {
    if (shoe.length < shuffleAfter * 52) buildShoe();
  }

  /* ---------- Chips ---------- */
  function buildChips() {
    chipTrayEl.innerHTML = "";
    [5, 10, 25, 50, 100].forEach((v) => {
      const c = document.createElement("div");
      c.className = `chip chip-${v}`;
      c.textContent = `$${v}`;
      c.onclick = () => {
        if (inPlay) return;
        addChip(v);
      };
      chipTrayEl.appendChild(c);
    });
  }

  function addChip(v) {
    bet.push(v);
    normalizeBet();
    renderBet();
  }

  function normalizeBet() {
    let total = bet.reduce((a, b) => a + b, 0);
    bet = [];

    [100, 50, 25, 10, 5].forEach((d) => {
      while (total >= d) {
        bet.push(d);
        total -= d;
      }
    });

    betTotal = bet.reduce((a, b) => a + b, 0);
  }

  function renderBet() {
    betStackEl.innerHTML = "";
    bet.forEach((v, i) => {
      const c = document.createElement("div");
      c.className = `chip chip-${v}`;
      c.textContent = `$${v}`;
      c.style.transform = `translateY(-${i * 5}px)`;

      c.onclick = () => {
        if (inPlay) return;
        bet.splice(i, 1);
        normalizeBet();
        renderBet();
      };

      betStackEl.appendChild(c);
    });
  }

  /* ---------- Re-bet auto deal ---------- */
  function tryAutoDeal() {
    if (!rebetToggle.checked) return;
    if (inPlay) return;
    if (!betTotal) return;
    if (bankroll < betTotal) {
      // stop loop if broke
      rebetToggle.checked = false;
      showOutcome("INSUFFICIENT BANKROLL", 0);
      setTimeout(() => hideOutcome(), 2000);
      return;
    }
    dealBtn.click();
  }

  /* ---------- Actions ---------- */
  dealBtn.onclick = () => {
    if (inPlay) return;
    if (!betTotal) return;
    if (bankroll < betTotal) return;

    // snapshot for re-bet loop
    lastBet = [...bet];
    lastBetTotal = betTotal;

    inPlay = true;

    stats.hands++;
    updateStatsUI();

    bankroll -= betTotal;
    updateBankrollUI();

    resetHands();
    maybeReshuffle();

    dealCard(player, true);
    dealCard(dealer, true);
    dealCard(player, true);
    hole = dealCard(dealer, false);

    updateTotals(false);
    updateStrategy();

    hitBtn.disabled = false;
    standBtn.disabled = false;
    doubleBtn.disabled = false;

    // Split placeholder still disabled
    splitBtn.disabled = true;

    // Immediate blackjack check
    if (isBlackjack(player)) {
      revealHole();
      updateTotals(true);

      if (isBlackjack(dealer)) endRound("push", "Push (Both Blackjack)");
      else endRound("blackjack", "Blackjack");
    }
  };

  hitBtn.onclick = () => {
    if (!inPlay) return;

    recordMistakeIfAny("Hit");

    dealCard(player, true);
    updateTotals(false);
    updateStrategy();

    if (handValue(player) > 21) {
      revealHole();
      updateTotals(true);
      endRound("loss", "Bust");
      return;
    }
  };

  standBtn.onclick = () => {
    if (!inPlay) return;
    recordMistakeIfAny("Stand");
    dealerTurn();
  };

  doubleBtn.onclick = () => {
    if (!inPlay) return;
    if (player.length !== 2) return;
    if (bankroll < betTotal) return;

    recordMistakeIfAny("Double");

    bankroll -= betTotal;
    betTotal *= 2;
    updateBankrollUI();

    dealCard(player, true);
    updateTotals(false);
    updateStrategy();

    if (handValue(player) > 21) {
      revealHole();
      updateTotals(true);
      endRound("loss", "Bust");
      return;
    }

    dealerTurn();
  };

  /* ---------- Dealer turn (H17 default) ---------- */
  function dealerTurn() {
    revealHole();
    updateTotals(true);
    disableActions();

    const step = () => {
      const info = handInfo(dealer);
      const dTotal = info.total;
      const isSoft = info.soft;

      const shouldHit =
        (dTotal < 17) ||
        (DEALER_HITS_SOFT_17 && dTotal === 17 && isSoft);

      if (shouldHit) {
        setTimeout(() => {
          dealCard(dealer, true);
          updateTotals(true);
          step();
        }, 700);
      } else {
        resolveHand();
      }
    };

    step();
  }

  function disableActions() {
    hitBtn.disabled = true;
    standBtn.disabled = true;
    doubleBtn.disabled = true;
    splitBtn.disabled = true;
  }

  function resetButtons() {
    disableActions();
  }

  /* ---------- Totals ---------- */
  function updateTotals(dealerRevealed) {
    if (player.length) playerTotalEl.textContent = `(${handValue(player)})`;
    else playerTotalEl.textContent = "";

    if (!dealer.length) {
      dealerTotalEl.textContent = "";
      return;
    }

    if (!dealerRevealed) {
      dealerTotalEl.textContent = `(${singleCardValue(dealer[0])})`;
    } else {
      dealerTotalEl.textContent = `(${handValue(dealer)})`;
    }
  }

  /* ---------- Deal card + visuals ---------- */
  function dealCard(hand, reveal) {
    maybeReshuffle();
    const c = shoe.pop();
    hand.push(c);

    const isRed = (c.s === "♥" || c.s === "♦");
    const div = document.createElement("div");

    if (reveal) {
      div.className = `card ${isRed ? "red" : "black"}`;
      div.innerHTML = cardSVG(c);
      updateCount(c);
    } else {
      div.className = "card back";
      div.innerHTML = "";
    }

    if (hand === player) playerHandEl.appendChild(div);
    else dealerHandEl.appendChild(div);

    return c;
  }

  function revealHole() {
    const holeDiv = dealerHandEl.children[1];
    if (!holeDiv) return;
    if (!holeDiv.classList.contains("back")) return;

    const isRed = (hole.s === "♥" || hole.s === "♦");
    holeDiv.className = `card ${isRed ? "red" : "black"}`;
    holeDiv.innerHTML = cardSVG(hole);

    updateCount(hole);
  }

  /* ---------- Counting ---------- */
  function updateCount(c) {
    runningCount += COUNT_VALUES[c.v] || 0;
    updateCountUI();
  }

  function updateCountUI() {
    countEl.textContent = runningCount.toLocaleString();
    const decksLeft = Math.max(shoe.length / 52, 0.25);
    trueCountEl.textContent = (runningCount / decksLeft).toFixed(1);
  }

  /* ---------- Resolve ---------- */
  function resolveHand() {
    const p = handValue(player);
    const d = handValue(dealer);

    if (p > 21) { endRound("loss", "Bust"); return; }
    if (d > 21) { endRound("win", "Dealer Bust"); return; }

    if (p > d) endRound("win", "You Win");
    else if (p < d) endRound("loss", "Dealer Wins");
    else endRound("push", "Push");
  }

  function endRound(type, label) {
    inPlay = false;
    disableActions();

    let payout = 0;
    if (type === "blackjack") payout = betTotal * 2.5;
    else if (type === "win") payout = betTotal * 2;
    else if (type === "push") payout = betTotal;
    else payout = 0;

    bankroll += payout;
    updateBankrollUI();

    const delta = payout - betTotal;

    if (type === "push") stats.pushes++;
    else if (type === "loss") stats.losses++;
    else stats.wins++;

    stats.net += delta;
    updateStatsUI();

    showOutcome(label, delta);

    setTimeout(() => {
      hideOutcome();
      softResetToBetting();

      // NEW: auto-run loop
      if (rebetToggle.checked) {
        setTimeout(() => tryAutoDeal(), 350);
      }
    }, 4000);
  }

  function showOutcome(text, delta) {
    outcomeText.textContent = text.toUpperCase();
    outcomeAmount.textContent =
      delta >= 0 ? `+ $${fmtMoney(delta)}` : `- $${fmtMoney(Math.abs(delta))}`;
    outcomePanel.classList.remove("hidden");
  }

  function hideOutcome() {
    outcomePanel.classList.add("hidden");
  }

  /* ---------- Strategy + mistake tracker ---------- */
  function computeStrategyAdvice() {
    if (!player.length || !dealer.length) return "—";

    const pInfo = handInfo(player);
    const up = dealer[0].v;
    const d = up === "A" ? 11 : ("KQJ".includes(up) ? 10 : up);

    let advice = "Stand";

    if (pInfo.soft) {
      const t = pInfo.total;
      if (t <= 17) advice = "Hit";
      else if (t === 18) advice = (d >= 9 || d === 11) ? "Hit" : "Stand";
      else advice = "Stand";
    } else {
      const t = pInfo.total;
      if (t <= 8) advice = "Hit";
      else if (t === 9) advice = (d >= 3 && d <= 6) ? "Double" : "Hit";
      else if (t === 10) advice = (d <= 9) ? "Double" : "Hit";
      else if (t === 11) advice = "Double";
      else if (t === 12) advice = (d >= 4 && d <= 6) ? "Stand" : "Hit";
      else if (t >= 13 && t <= 16) advice = (d <= 6) ? "Stand" : "Hit";
      else advice = "Stand";
    }

    return advice;
  }

  function updateStrategy() {
    if (!strategyToggle.checked) {
      strategyHintEl.textContent = "—";
      return;
    }
    if (!player.length || !dealer.length) {
      strategyHintEl.textContent = "—";
      return;
    }
    const advice = computeStrategyAdvice();
    strategyHintEl.textContent = advice === "Double" ? "Double (if allowed)" : advice;
  }

  function recordMistakeIfAny(action) {
    // Only evaluate if strategy is enabled and game state is valid
    if (!strategyToggle.checked) return;
    if (!player.length || !dealer.length) return;

    const rec = computeStrategyAdvice();
    if (rec === "—") return;

    // Normalize: if strategy says Double but action Hit/Stand is chosen, flag
    if (action !== rec) {
      mistakes++;
      updateMistakesUI(`${action} (you) vs ${rec} (basic)`);
    }
  }

  function updateMistakesUI(last) {
    mistakesEl.textContent = mistakes.toLocaleString();
    mistakeLastEl.textContent = last || "—";
  }

  /* ---------- Stats UI ---------- */
  function updateStatsUI() {
    handsEl.textContent = stats.hands.toLocaleString();
    winsEl.textContent = stats.wins.toLocaleString();
    lossesEl.textContent = stats.losses.toLocaleString();
    pushesEl.textContent = stats.pushes.toLocaleString();
    netEl.textContent = `$${fmtMoney(stats.net)}`;
  }

  /* ---------- Hand helpers ---------- */
  function handValue(h) { return handInfo(h).total; }

  function handInfo(h) {
    let total = 0;
    let aces = 0;

    for (const c of h) {
      if (c.v === "A") { total += 11; aces++; }
      else if ("KQJ".includes(c.v)) total += 10;
      else total += c.v;
    }

    while (total > 21 && aces > 0) {
      total -= 10;
      aces--;
    }

    // soft means at least one ace is still counted as 11
    return { total, soft: aces > 0 };
  }

  function isBlackjack(h) {
    return h.length === 2 && handValue(h) === 21;
  }

  function singleCardValue(c) {
    if (c.v === "A") return 11;
    if ("KQJ".includes(c.v)) return 10;
    return c.v;
  }

  /* ---------- Resets (Re-bet mode) ---------- */
  function resetHands() {
    player = [];
    dealer = [];
    hole = null;

    playerHandEl.innerHTML = "";
    dealerHandEl.innerHTML = "";

    playerTotalEl.textContent = "";
    dealerTotalEl.textContent = "";
  }

  function softResetToBetting() {
    resetHands();

    if (rebetToggle.checked && lastBetTotal > 0) {
      bet = [...lastBet];
      betTotal = lastBetTotal;
      renderBet();
    } else {
      bet = [];
      betTotal = 0;
      renderBet();
    }

    updateStrategy();
    resetButtons();
  }

  function hardResetToBetting() {
    softResetToBetting();
    runningCount = 0;
    updateCountUI();
  }

  function updateBankrollUI() {
    bankrollEl.textContent = `Bankroll: $${fmtMoney(bankroll)}`;
  }

  /* ---------- SVG card render ---------- */
  function cardSVG(c) {
    return `
      <svg viewBox="0 0 90 130" aria-label="${c.v}${c.s}">
        <rect x="0" y="0" width="90" height="130" rx="12" ry="12" fill="white"></rect>

        <text x="8" y="18" font-size="14" fill="currentColor" font-weight="700">${c.v}${c.s}</text>
        <text x="45" y="75" font-size="40" text-anchor="middle" fill="currentColor">${c.s}</text>

        <g transform="rotate(180 82 118)">
          <text x="82" y="118" font-size="14" text-anchor="end" fill="currentColor" font-weight="700">${c.v}${c.s}</text>
        </g>
      </svg>
    `;
  }
});
