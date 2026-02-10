document.addEventListener("DOMContentLoaded", () => {
  // Defaults
  const DEFAULT_DECKS = 8;
  const DEFAULT_SHUFFLE_AFTER = 2;

  // Rules defaults
  const DEALER_HITS_SOFT_17 = true;      // H17
  const DOUBLE_AFTER_SPLIT = true;       // DAS

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

  let decks = DEFAULT_DECKS;
  let shuffleAfter = DEFAULT_SHUFFLE_AFTER;

  let bankrollTotal = 1000;

  let bet = [];
  let betTotal = 0;

  let lastBet = [];
  let lastBetTotal = 0;

  let inPlay = false;
  let arming = false;
  let armTimer = null;

  let dealer = [];
  let hole = null;

  // split hands
  let hands = [];
  let activeHand = 0;
  let isSplit = false;

  // stats
  const stats = { hands: 0, wins: 0, losses: 0, pushes: 0, net: 0 };

  // mistakes
  let mistakes = 0;
  let handHadMistake = false;
  let lastBasicAdvice = "";

  // Elements
  const dealerHandEl = el("dealer-hand");
  const dealerTotalEl = el("dealer-total");

  const playerTotalEl = el("player-total");
  const lane0 = el("lane-0");
  const lane1 = el("lane-1");
  const badge0 = el("lane-badge-0");
  const badge1 = el("lane-badge-1");
  const pHandEl0 = el("player-hand-0");
  const pHandEl1 = el("player-hand-1");

  const betStackEl = el("bet-stack");
  const chipTrayEl = el("chip-tray");

  const bankrollEl = el("bankroll");
  const betReadoutEl = el("bet-readout");

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
  const splitBtn = el("split");

  const strategyToggle = el("strategy-toggle");
  const rebetToggle = el("rebet-toggle");
  const strategyHintEl = el("strategy-hint");

  const outcomePanel = el("outcome-panel");
  const outcomeText = el("outcome-text");
  const outcomeAmount = el("outcome-amount");

  const addFundsBtn = el("add-funds-btn");
  const fundBox = el("fund-box");
  const fundOtherInput = el("fund-other-input");
  const fundOtherAdd = el("fund-other-add");

  const mistakesEl = el("mistakes");
  const mistakeLastEl = el("mistake-last");

  init();

  function init() {
    buildSelectors();
    buildShoe();
    buildChips();
    bindFundsUI();

    resetTableVisuals();
    updateCountUI();
    updateStatsUI();
    updateBankrollUI();
    updateBetReadout();
    updateMistakeUI("", false);
    updateStrategyUI();
    resetActionButtonsForPreDeal();

    strategyToggle.onchange = updateStrategyUI;

    addFundsBtn.onclick = () => openFunds();

    rebetToggle.onchange = () => {
      if (rebetToggle.checked) {
        if (!inPlay && !arming && betTotal > 0) beginHandWithArming("rebet-click");
        if (!inPlay && !arming && betTotal === 0 && lastBetTotal > 0) {
          bet = [...lastBet];
          betTotal = lastBetTotal;
          renderBetMountains();
          updateBankrollUI();
          updateBetReadout();
          beginHandWithArming("rebet-restore");
        }
      }
    };
  }

  // ---------- UI helpers ----------
  function updateBankrollUI() {
    // show reserved funds before deal; show actual during play
    const shown = inPlay ? bankrollTotal : (bankrollTotal - betTotal);
    bankrollEl.textContent = `Bankroll: $${fmtMoney(Math.max(shown, 0))}`;
  }

  function updateBetReadout() {
    betReadoutEl.textContent = `$${fmtMoney(betTotal)}`;
  }

  function showOutcome(text, delta, opts = {}) {
    outcomeText.textContent = text.toUpperCase();
    outcomeAmount.textContent =
      typeof delta === "number"
        ? (delta >= 0 ? `+ $${fmtMoney(delta)}` : `- $${fmtMoney(Math.abs(delta))}`)
        : (delta || "");

    if (opts.funds) fundBox.classList.remove("hidden");
    else fundBox.classList.add("hidden");

    outcomePanel.classList.remove("hidden");
  }

  function hideOutcome() {
    outcomePanel.classList.add("hidden");
    fundBox.classList.add("hidden");
  }

  function openFunds() {
    showOutcome("Add funds", "", { funds: true });
    // keep open briefly; user can re-open anytime
    setTimeout(() => {
      if (!outcomePanel.classList.contains("hidden")) hideOutcome();
    }, 9000);
  }

  function updateMistakeUI(text, isBad) {
    mistakesEl.textContent = mistakes.toLocaleString();
    mistakeLastEl.textContent = text || "";
    mistakeLastEl.classList.toggle("bad", !!isBad);
  }

  function flashMistakeAfterHand() {
    if (!handHadMistake || !lastBasicAdvice) {
      updateMistakeUI("", false);
      return;
    }
    updateMistakeUI(lastBasicAdvice, true);
    setTimeout(() => updateMistakeUI("", false), 4000);
  }

  function setActiveLaneUI() {
    lane0.classList.toggle("active", activeHand === 0);
    lane1.classList.toggle("active", activeHand === 1);
  }

  // ---------- Selectors ----------
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

  // ---------- Shoe ----------
  function buildShoe() {
    shoe = [];
    const suits = ["♠", "♥", "♦", "♣"];
    const vals = ["A", 2, 3, 4, 5, 6, 7, 8, 9, 10, "J", "Q", "K"];
    for (let d = 0; d < decks; d++) for (const s of suits) for (const v of vals) shoe.push({ s, v });
    shoe.sort(() => Math.random() - 0.5);
    runningCount = 0;
    updateCountUI();
  }

  function maybeReshuffle() {
    if (shoe.length < shuffleAfter * 52) buildShoe();
  }

  // ---------- Chips / betting ----------
  function buildChips() {
    chipTrayEl.innerHTML = "";
    [5, 10, 25, 50, 100].forEach((v) => {
      const c = document.createElement("div");
      c.className = `chip chip-${v}`;
      c.textContent = `$${v}`;
      c.addEventListener("click", () => {
        if (inPlay) return;
        addChip(v);
      });
      chipTrayEl.appendChild(c);
    });
  }

  function addChip(v) {
    const proposed = betTotal + v;
    if (proposed > bankrollTotal) {
      notEnoughFunds();
      return;
    }
    bet.push(v);
    normalizeBet();
    renderBetMountains();
    updateBankrollUI();
    updateBetReadout();

    if (rebetToggle.checked && !inPlay && !arming) {
      beginHandWithArming("rebet-chip");
    }
  }

  function removeChipAt(index) {
    bet.splice(index, 1);
    normalizeBet();
    renderBetMountains();
    updateBankrollUI();
    updateBetReadout();
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

  // Mountain-stacks: small stacks up to 5 chips, staggered along a ridge arc
  function renderBetMountains() {
    betStackEl.innerHTML = "";
    if (!bet.length) return;

    // group chips into stacks of up to 5
    const stacks = [];
    for (let i = 0; i < bet.length; i += 5) stacks.push(bet.slice(i, i + 5));

    const m = stacks.length;
    const baseRadius = 86;
    const spread = Math.PI * 0.85;
    const start = -spread / 2;
    const step = m === 1 ? 0 : spread / (m - 1);

    stacks.forEach((stack, sIdx) => {
      const ang = start + step * sIdx;

      // ridge position
      const x = Math.cos(ang) * baseRadius;
      const y = Math.sin(ang) * baseRadius * 0.45;

      // stagger like rolling mountains
      const ridgeLift = (Math.abs(sIdx - (m - 1) / 2)) * 3; // gentle taper
      const staggerY = y - ridgeLift;

      stack.forEach((denom, j) => {
        const chip = document.createElement("div");
        chip.className = `chip chip-${denom}`;
        chip.textContent = `$${denom}`;

        // stack offsets (small pile)
        const stackX = x + (j % 2 === 0 ? -2 : 2);
        const stackY = staggerY - (j * 6);

        chip.style.left = "50%";
        chip.style.top = "50%";
        chip.style.transform = `translate(-50%, -50%) translate(${stackX}px, ${stackY}px)`;

        // Map click to original chip index for removal
        const originalIndex = sIdx * 5 + j;
        chip.onclick = () => {
          if (inPlay) return;
          removeChipAt(originalIndex);
        };

        betStackEl.appendChild(chip);
      });
    });
  }

  // ---------- Funds ----------
  function bindFundsUI() {
    document.querySelectorAll(".fund-btn[data-amt]").forEach(btn => {
      btn.addEventListener("click", () => {
        const amt = +btn.dataset.amt;
        bankrollTotal += amt;
        hideOutcome();
        updateBankrollUI();
      });
    });

    fundOtherAdd.addEventListener("click", () => {
      const v = Number(fundOtherInput.value || 0);
      if (v > 0) {
        bankrollTotal += v;
        fundOtherInput.value = "";
        hideOutcome();
        updateBankrollUI();
      }
    });
  }

  function notEnoughFunds() {
    showOutcome("Not enough funds", "", { funds: true });
    setTimeout(() => {
      if (!outcomePanel.classList.contains("hidden")) hideOutcome();
    }, 6500);
  }

  // ---------- Hand lifecycle ----------
  dealBtn.onclick = () => {
    if (inPlay || arming) return;
    if (!betTotal) return;
    if (betTotal > bankrollTotal) return notEnoughFunds();
    beginHandWithArming("deal");
  };

  function beginHandWithArming(source) {
    if (inPlay || arming) return;
    if (!betTotal) return;
    if (betTotal > bankrollTotal) return notEnoughFunds();

    lastBet = [...bet];
    lastBetTotal = betTotal;

    arming = true;
    resetActionButtonsForPreDeal();

    if (armTimer) clearTimeout(armTimer);
    armTimer = setTimeout(() => {
      arming = false;
      startHandDeal();
    }, 500);
  }

  function startHandDeal() {
    if (inPlay) return;
    if (!betTotal) return;
    if (betTotal > bankrollTotal) return notEnoughFunds();

    inPlay = true;

    stats.hands++;
    updateStatsUI();

    bankrollTotal -= betTotal;
    updateBankrollUI();

    handHadMistake = false;
    lastBasicAdvice = "";

    isSplit = false;
    activeHand = 0;
    hands = [{ cards: [], bet: betTotal, done: false, result: null }];

    resetTableVisuals();
    maybeReshuffle();

    dealToHand(0, true);
    dealDealer(true);
    dealToHand(0, true);
    hole = dealDealer(false);

    updateTotals(false);
    updateStrategyUI();
    setActiveLaneUI();

    hitBtn.disabled = false;
    standBtn.disabled = false;
    doubleBtn.disabled = false;
    splitBtn.disabled = !canSplit(hands[0].cards);

    if (isBlackjack(hands[0].cards)) {
      revealHole();
      updateTotals(true);
      if (isBlackjack(dealer)) endRoundAll("push", "Push (Both Blackjack)");
      else endRoundAll("blackjack", "Blackjack");
    }
  }

  function resetTableVisuals() {
    dealer = [];
    hole = null;
    dealerHandEl.innerHTML = "";
    dealerTotalEl.textContent = "";

    lane1.classList.add("hidden");
    lane0.classList.remove("hidden");
    lane0.classList.remove("active");
    lane1.classList.remove("active");

    pHandEl0.innerHTML = "";
    pHandEl1.innerHTML = "";

    badge0.textContent = "";
    badge1.textContent = "";

    playerTotalEl.textContent = "";

    hideOutcome();
  }

  function resetActionButtonsForPreDeal() {
    hitBtn.disabled = true;
    standBtn.disabled = true;
    doubleBtn.disabled = true;
    splitBtn.disabled = true;
  }

  // ---------- Player actions ----------
  hitBtn.onclick = () => {
    if (!inPlay) return;
    if (hands[activeHand]?.done) return;

    recordMistakeIfAny("Hit");

    dealToHand(activeHand, true);
    updateTotals(false);
    updateStrategyUI();

    if (handInfo(hands[activeHand].cards).total > 21) {
      hands[activeHand].done = true;
      hands[activeHand].result = "loss";

      if (allPlayerHandsDone()) {
        revealHole();
        updateTotals(true);
        endRoundAll("loss", "Bust");
      } else {
        advanceHandOrDealer();
      }
    }
  };

  standBtn.onclick = () => {
    if (!inPlay) return;
    if (hands[activeHand]?.done) return;

    recordMistakeIfAny("Stand");

    hands[activeHand].done = true;
    advanceHandOrDealer();
  };

  doubleBtn.onclick = () => {
    if (!inPlay) return;
    const h = hands[activeHand];
    if (!h || h.done) return;
    if (h.cards.length !== 2) return;
    if (isSplit && !DOUBLE_AFTER_SPLIT) return;

    if (bankrollTotal < h.bet) return notEnoughFunds();

    recordMistakeIfAny("Double");

    bankrollTotal -= h.bet;
    updateBankrollUI();
    h.bet *= 2;

    dealToHand(activeHand, true);
    updateTotals(false);
    updateStrategyUI();

    const total = handInfo(h.cards).total;
    h.done = true;
    if (total > 21) h.result = "loss";

    if (allPlayerHandsDone()) {
      revealHole();
      updateTotals(true);
      if (allPlayerHandsBusted()) endRoundAll("loss", "Bust");
      else dealerTurn();
    } else {
      advanceHandOrDealer();
    }
  };

  splitBtn.onclick = () => {
    if (!inPlay) return;
    if (isSplit) return;

    const h0 = hands[0];
    if (!h0 || h0.cards.length !== 2) return;
    if (!canSplit(h0.cards)) return;

    if (bankrollTotal < h0.bet) return notEnoughFunds();

    bankrollTotal -= h0.bet;
    updateBankrollUI();

    isSplit = true;
    lane1.classList.remove("hidden");

    const c1 = h0.cards[0];
    const c2 = h0.cards[1];

    hands = [
      { cards: [c1], bet: h0.bet, done: false, result: null },
      { cards: [c2], bet: h0.bet, done: false, result: null }
    ];
    activeHand = 0;

    pHandEl0.innerHTML = "";
    pHandEl1.innerHTML = "";
    renderCardToLane(0, c1, true);
    renderCardToLane(1, c2, true);

    dealToHand(0, true);
    dealToHand(1, true);

    updateTotals(false);
    updateStrategyUI();
    setActiveLaneUI();

    splitBtn.disabled = true;
  };

  function advanceHandOrDealer() {
    if (isSplit) {
      if (!hands[0].done) activeHand = 0;
      else if (!hands[1].done) activeHand = 1;
      else {
        if (allPlayerHandsBusted()) {
          revealHole();
          updateTotals(true);
          endRoundAll("loss", "Bust");
        } else dealerTurn();
        return;
      }
      setActiveLaneUI();
      updateTotals(false);
      updateStrategyUI();
      const h = hands[activeHand];
      hitBtn.disabled = !!h.done;
      standBtn.disabled = !!h.done;
      doubleBtn.disabled = !(h.cards.length === 2 && !h.done && ( !isSplit || DOUBLE_AFTER_SPLIT ));
      splitBtn.disabled = true;
      return;
    }

    if (hands[0].done) {
      if (handInfo(hands[0].cards).total > 21) {
        revealHole();
        updateTotals(true);
        endRoundAll("loss", "Bust");
      } else dealerTurn();
    }
  }

  // ---------- Dealer turn ----------
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
          dealDealer(true);
          updateTotals(true);
          step();
        }, 700);
      } else {
        resolveAllHands();
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

  // ---------- Dealing ----------
  function dealToHand(handIndex, reveal) {
    const c = popCard();
    hands[handIndex].cards.push(c);
    renderCardToLane(handIndex, c, reveal);
    if (reveal) updateCount(c);
    return c;
  }

  function renderCardToLane(handIndex, c, reveal) {
    const isRed = (c.s === "♥" || c.s === "♦");
    const div = document.createElement("div");
    if (reveal) {
      div.className = `card ${isRed ? "red" : "black"}`;
      div.innerHTML = cardSVG(c);
    } else {
      div.className = "card back";
      div.innerHTML = "";
    }
    (handIndex === 0 ? pHandEl0 : pHandEl1).appendChild(div);
  }

  function dealDealer(reveal) {
    const c = popCard();
    dealer.push(c);

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
    dealerHandEl.appendChild(div);
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

  function popCard() {
    maybeReshuffle();
    return shoe.pop();
  }

  // ---------- Totals ----------
  function updateTotals(dealerRevealed) {
    // lane badges
    if (hands[0]) badge0.textContent = handInfo(hands[0].cards).total ? `${handInfo(hands[0].cards).total}` : "";
    if (hands[1]) badge1.textContent = handInfo(hands[1].cards).total ? `${handInfo(hands[1].cards).total}` : "";

    // player header total = active hand total (clean + matches Dealer style)
    if (inPlay && hands[activeHand]) {
      playerTotalEl.textContent = `(${handInfo(hands[activeHand].cards).total})`;
    } else {
      playerTotalEl.textContent = "";
    }

    // dealer header
    if (!dealer.length) {
      dealerTotalEl.textContent = "";
    } else if (!dealerRevealed) {
      dealerTotalEl.textContent = `(${singleCardValue(dealer[0])})`;
    } else {
      dealerTotalEl.textContent = `(${handInfo(dealer).total})`;
    }

    // enable/disable buttons
    if (inPlay) {
      setActiveLaneUI();
      const h = hands[activeHand];
      if (!h || h.done) {
        hitBtn.disabled = true;
        standBtn.disabled = true;
        doubleBtn.disabled = true;
      } else {
        hitBtn.disabled = false;
        standBtn.disabled = false;
        doubleBtn.disabled = !(h.cards.length === 2 && (!isSplit || DOUBLE_AFTER_SPLIT));
      }
      splitBtn.disabled = isSplit ? true : !canSplit(hands[0]?.cards || []);
    }
  }

  // ---------- Counting ----------
  function updateCount(card) {
    runningCount += COUNT_VALUES[card.v] || 0;
    updateCountUI();
  }

  function updateCountUI() {
    countEl.textContent = runningCount.toLocaleString();
    const decksLeft = Math.max(shoe.length / 52, 0.25);
    trueCountEl.textContent = (runningCount / decksLeft).toFixed(1);
  }

  // ---------- Resolve ----------
  function resolveAllHands() {
    const dealerTotal = handInfo(dealer).total;

    hands.forEach(h => {
      const t = handInfo(h.cards).total;
      if (t > 21) { h.result = "loss"; return; }
      if (!isSplit && isBlackjack(h.cards)) { h.result = "blackjack"; return; }

      if (dealerTotal > 21) h.result = "win";
      else if (t > dealerTotal) h.result = "win";
      else if (t < dealerTotal) h.result = "loss";
      else h.result = "push";
    });

    settleHands();
  }

  function endRoundAll(type, label) {
    hands.forEach(h => {
      h.result = type;
      h.done = true;
    });
    settleHands(label);
  }

  function settleHands(labelOverride) {
    inPlay = false;
    disableActions();

    let totalDelta = 0;

    hands.forEach(h => {
      let payout = 0;
      if (h.result === "blackjack") payout = h.bet * 2.5;
      else if (h.result === "win") payout = h.bet * 2;
      else if (h.result === "push") payout = h.bet;
      else payout = 0;

      bankrollTotal += payout;
      totalDelta += (payout - h.bet);
    });

    updateBankrollUI();

    hands.forEach(h => {
      if (h.result === "push") stats.pushes++;
      else if (h.result === "loss") stats.losses++;
      else stats.wins++;
    });
    stats.net += totalDelta;
    updateStatsUI();

    showOutcome(labelOverride || summarizeOutcome(), totalDelta);

    // show mistake briefly after settle
    flashMistakeAfterHand();

    setTimeout(() => {
      hideOutcome();
      softResetToBetting();

      if (rebetToggle.checked) {
        setTimeout(() => {
          if (!rebetToggle.checked) return;
          if (!betTotal && lastBetTotal) {
            bet = [...lastBet];
            betTotal = lastBetTotal;
            renderBetMountains();
            updateBankrollUI();
            updateBetReadout();
          }
          beginHandWithArming("rebet-loop");
        }, 350);
      }
    }, 4000);
  }

  function summarizeOutcome() {
    if (hands.length === 1) {
      const r = hands[0].result;
      if (r === "blackjack") return "Blackjack";
      if (r === "win") return "You Win";
      if (r === "push") return "Push";
      return "Dealer Wins";
    }
    return `Hand 1: ${hands[0].result.toUpperCase()} | Hand 2: ${hands[1].result.toUpperCase()}`;
  }

  // ---------- Strategy + mistakes ----------
  function computeStrategyAdvice(cards, dealerUpV) {
    if (!cards.length || !dealerUpV) return "—";

    const pInfo = handInfo(cards);
    const up = dealerUpV;
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

  function updateStrategyUI() {
    if (!strategyToggle.checked) {
      strategyHintEl.textContent = "—";
      return;
    }
    if (!inPlay || !dealer.length || !hands[activeHand]) {
      strategyHintEl.textContent = "—";
      return;
    }
    const rec = computeStrategyAdvice(hands[activeHand].cards, dealer[0].v);
    strategyHintEl.textContent = (rec === "Double") ? "Double (if allowed)" : rec;
  }

  function recordMistakeIfAny(action) {
    if (!strategyToggle.checked) return;
    if (!dealer.length || !hands[activeHand]) return;

    const rec = computeStrategyAdvice(hands[activeHand].cards, dealer[0].v);
    if (rec === "—") return;

    if (action !== rec) {
      mistakes++;
      handHadMistake = true;
      lastBasicAdvice = rec.toUpperCase();
    }
    mistakesEl.textContent = mistakes.toLocaleString();
  }

  // ---------- Split eligibility ----------
  function canSplit(cards) {
    if (!cards || cards.length !== 2) return false;
    return rankForSplit(cards[0].v) === rankForSplit(cards[1].v);
  }

  function rankForSplit(v) {
    if ("KQJ".includes(v)) return 10;
    return v;
  }

  // ---------- Hand math helpers ----------
  function handInfo(cards) {
    let total = 0;
    let aces = 0;

    for (const c of cards) {
      if (c.v === "A") { total += 11; aces++; }
      else if ("KQJ".includes(c.v)) total += 10;
      else total += c.v;
    }

    while (total > 21 && aces > 0) {
      total -= 10;
      aces--;
    }

    return { total, soft: aces > 0 };
  }

  function singleCardValue(c) {
    if (c.v === "A") return 11;
    if ("KQJ".includes(c.v)) return 10;
    return c.v;
  }

  function isBlackjack(cards) {
    return cards.length === 2 && handInfo(cards).total === 21;
  }

  function allPlayerHandsDone() {
    return hands.every(h => h.done || handInfo(h.cards).total > 21);
  }

  function allPlayerHandsBusted() {
    return hands.every(h => handInfo(h.cards).total > 21);
  }

  // ---------- Stats UI ----------
  function updateStatsUI() {
    handsEl.textContent = stats.hands.toLocaleString();
    winsEl.textContent = stats.wins.toLocaleString();
    lossesEl.textContent = stats.losses.toLocaleString();
    pushesEl.textContent = stats.pushes.toLocaleString();
    netEl.textContent = `$${fmtMoney(stats.net)}`;
  }

  // ---------- Resets ----------
  function softResetToBetting() {
    resetTableVisuals();

    if (rebetToggle.checked && lastBetTotal > 0) {
      bet = [...lastBet];
      betTotal = lastBetTotal;
    } else {
      bet = [];
      betTotal = 0;
    }

    renderBetMountains();
    updateBankrollUI();
    updateBetReadout();
    updateStrategyUI();

    // clear mistake text between hands
    updateMistakeUI("", false);
  }

  function hardResetToBetting() {
    softResetToBetting();
    runningCount = 0;
    updateCountUI();
  }

  // ---------- SVG card render ----------
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

