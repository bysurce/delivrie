// Pricing page: Plans view (plans, pay-as-you-go packs) and Compare view (Delivrie vs Resend vs Brevo), plus a short FAQ.
// Amounts match the billing function (supabase/functions/billing/index.ts) in major units.
(function () {
  var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s: string, r?: ParentNode): any { return (r || document).querySelector(s); };
  var $$ = function (s: string, r?: ParentNode): any[] { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var P = {
    USD: { sym: '$', starter: 10, starterY: 100, starterOver: 0.45, pro: 20, scale: 45, proY: 200, scaleY: 450, proOver: 0.45, scaleOver: 0.40, payg: 0.60, growth: 20, mktPro: 40, extraContacts: 3.5, packs: [[5, 8300, 'Minimum', 0.60], [25, 41600, '', 0.60], [100, 172400, 'Save 3%', 0.58], [500, 925900, 'Save 10%', 0.54]] }
  };
  // Prices are in US dollars for everyone.
  var cur = 'USD', mode = 'monthly';
  if (/yearly/.test(location.hash)) mode = 'yearly'; else if (/payg|credits/.test(location.hash)) mode = 'payg';
  var view = /^\/(compare|vs\/)/.test(location.pathname) || /compare|vs/.test(location.hash) ? 'compare' : 'plans';

  var m = function (v: number, exact?: boolean) {
    var p = P[cur], dec = exact && v % 1 ? 2 : 0;
    return p.sym + Number(v).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  };
  var check = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5L9.5 17L19 7.5"/></svg>';
  var dash = '<span class="dash">—</span>';

  function plans() {
    var p = P[cur], y = mode === 'yearly';
    var cards = [
      { id: 'free', name: 'Free', tag: 'For side projects and testing.', price: m(0), sub: y ? 'Free forever' : '', cta: ['Start for free', '/signup', ''], head: 'Includes', feats: ['4,000 emails / month', '133 emails / day', '1 custom domain', '30-day data retention', '22 ready-made templates', 'API, SMTP & MCP server', 'Community support'] },
      { id: 'starter', name: 'Starter', tag: 'For products with real users.', price: y ? m(Math.round(p.starterY / 12 * 100) / 100, true) : m(p.starter), sub: y ? m(p.starterY) + ' billed yearly · save ' + m(p.starter * 12 - p.starterY) : '', cta: ['Get Starter', '/signup?plan=starter' + (y ? '&interval=yearly' : ''), ''], head: 'Everything in Free, plus', feats: ['20,000 emails / month', '1,500 emails / day', '10 custom domains', '30-day data retention', 'Brand kit for templates', m(p.starterOver, true) + ' per extra 1,000 emails', 'Webhooks & batch sending', 'Email support'] },
      { id: 'pro', name: 'Pro', pop: true, tag: 'For growing products.', price: y ? m(Math.round(p.proY / 12 * 100) / 100, true) : m(p.pro), sub: y ? m(p.proY) + ' billed yearly · save ' + m(p.pro * 12 - p.proY) : '', cta: ['Get Pro', '/signup?plan=pro' + (y ? '&interval=yearly' : ''), 'y'], head: 'Everything in Starter, plus', feats: ['60,000 emails / month', 'No daily limit', 'Three times the Starter allowance', m(p.proOver, true) + ' per extra 1,000 emails', 'Email support'] },
      { id: 'scale', name: 'Scale', tag: 'For teams sending at volume.', price: y ? m(Math.round(p.scaleY / 12 * 100) / 100, true) : m(p.scale), sub: y ? m(p.scaleY) + ' billed yearly · save ' + m(p.scale * 12 - p.scaleY) : '', cta: ['Get Scale', '/signup?plan=scale' + (y ? '&interval=yearly' : ''), ''], head: 'Everything in Pro, plus', feats: ['100,000 emails / month', 'No daily limit', '1,000 custom domains', '30-day data retention', m(p.scaleOver, true) + ' per extra 1,000 emails', 'Dedicated IP on request', 'Multiple team members', 'Priority support'] },
      { id: 'ent', name: 'Enterprise', tag: 'For high volume and compliance.', price: 'Custom', sub: y ? 'Annual contracts' : '', cta: ['Talk to sales', 'mailto:sales@delivrie.io?subject=Delivrie%20Enterprise', ''], head: 'Everything in Scale, plus', feats: ['Custom volume & pricing', 'Dedicated IPs included', 'Unlimited domains', 'Custom data retention', 'SSO / SAML & audit logs', 'Uptime SLA', 'Dedicated account manager'] }
    ];
    $('#plan-grid').innerHTML = cards.map(function (c) {
      return '<div class="plan' + (c.pop ? ' pop' : '') + '"><div class="ph"><h3>' + c.name + '</h3>' + (c.pop ? '<span class="mp y">Most popular</span>' : '') + '</div><p class="tag">' + c.tag + '</p>' +
        '<div class="pp"><b>' + c.price + '</b>' + (c.id === 'ent' ? '' : '<span>/month</span>') + '</div><div class="psub">' + (c.sub || '&nbsp;') + '</div>' +
        '<a class="' + (c.cta[2] ? 'b-primary' : 'b-secondary') + ' block" href="' + c.cta[1] + '">' + c.cta[0] + '</a>' +
        '<div class="fh">' + c.head + '</div><ul>' + c.feats.map(function (f) { return '<li>' + check + f + '</li>'; }).join('') + '</ul></div>';
    }).join('');
    $('#plan-note').textContent = 'Prices in US dollars, exclusive of taxes. ' + (y ? 'Yearly plans are billed upfront and renew annually.' : 'Billed monthly, cancel anytime.');
    $('#plans').style.display = mode === 'payg' ? 'none' : '';
    $('#payg-wrap').style.display = mode === 'payg' ? '' : 'none';
  }

  function payg() {
    var p = P[cur];
    $('#payg').innerHTML = '<div class="pg-l"><h3><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fad600" stroke-width="1.8" stroke-linejoin="round"><path d="M13 3L4.5 13.5H12L11 21L19.5 10.5H12L13 3Z"/></svg>Pay as you go</h3><div class="pp"><b>' + m(p.payg, true) + '</b><span>/ 1,000 emails</span></div><p>No subscription. Top up credits and send whenever you need to. Good for seasonal campaigns, low-volume OTPs and agents that send in bursts.</p><div class="row"><a class="b-primary" href="/signup?plan=payg">Buy credits</a><a class="b-secondary" href="#faq" data-open="credits">How credits work</a></div></div>' +
      '<div class="pg-r"><div class="mono-h dim">Credit packs</div><table class="packs"><thead><tr><th>Top-up</th><th>Emails</th><th>Effective rate</th><th></th></tr></thead><tbody>' +
      p.packs.map(function (k) { return '<tr><td>' + m(k[0]) + '</td><td>' + k[1].toLocaleString('en-US') + '</td><td>' + m(Math.round(k[0] / k[1] * 1000 * 100) / 100, true) + ' / 1k</td><td>' + (k[2] ? '<span class="note">' + k[2] + '</span>' : '') + '</td></tr>'; }).join('') +
      '</tbody></table><div class="pg-f"><span>' + check + 'Credits never expire</span><span>' + check + 'No daily limit</span><span>' + check + 'Same API as every plan</span></div></div>';
  }

  // Delivrie vs Resend vs Brevo. Competitor prices are their published US-dollar prices (checked 13 Nov 2026).
  // Defaults below; Admin → Website → Compare can change the figures, any cell, and the Explain notes.
  var CMP_DEFAULT = { fx: 1350, date: '13 November 2026', prices: { r20: 20, b20: 32, r100: 65, b100: 82, rOver: 0.9, bBrand: 12 } };
  var BRANDS = [['delivrie', 'Delivrie', '/assets/logo.svg', true], ['resend', 'Resend', '/assets/compare/resend.png', true], ['brevo', 'Brevo', '/assets/compare/brevo.png', true]];
  var arrow = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
  var escH = function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  function compareRows(c) {
    var p = P[cur], Y = check, N = dash, pr = c.prices;
    var usd = function (v) { return '$' + v.toLocaleString('en-US', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 }); };
    var price = function (v, plan) { return '<b>' + v + '</b><span class="vs-sub">' + plan + '</span>'; };
    return [
      ['free', 'Free plan', price('4,000 / month', '133 a day'), price('3,000 / month', '100 a day'), price('300 / day', 'about 9,000 a month'),
        'Free plans are where you build and launch. Delivrie gives you a third more than Resend’s monthly allowance. Brevo’s 300 a day adds up to more over a month, but every email carries a “Sent with Brevo” footer.'],
      ['v20', '20,000 emails / month', price(m(p.starter), 'Starter'), price(usd(pr.r20), 'Pro'), price(usd(pr.b20), 'Starter'),
        'A typical early product: sign-ups, receipts, password resets. Resend costs about twice as much and Brevo about three times. Brevo’s Starter is a marketing plan, so it also keeps the Brevo footer unless you pay ' + usd(pr.bBrand) + ' a month more.'],
      ['v100', '100,000 emails / month', price(m(p.scale), 'Scale'), price(usd(pr.r100), 'Pro + 50,000 extra'), price(usd(pr.b100), 'Starter'),
        'A product with steady traffic. Resend’s cheapest option here is Pro (50,000 included) plus 50,000 extra emails at ' + usd(pr.rOver) + ' per 1,000. Brevo moves you up a Starter tier. Delivrie Scale includes all 100,000.'],
      ['over', 'Extra emails, per 1,000', m(p.scaleOver, true) + ' – ' + m(p.starterOver, true), usd(pr.rOver), 'Upgrade the plan',
        'What a busy month costs. Delivrie keeps sending past your allowance and bills the extra at month end. Resend charges about twice as much per 1,000. Brevo has no per-email overage: you move to a bigger plan.'],
      ['smtp', 'SMTP relay', Y + ' Ports 587 and 465', Y, Y,
        'For tools that can’t call an API, like WordPress, Laravel or Supabase Auth. All three offer it. On Delivrie, SMTP mail gets the same limits, logs and webhooks as the API.'],
      ['brand', 'Provider branding', 'None', 'None', '“Sent with Brevo” on Starter',
        'A footer from your email provider sits at the bottom of every email you send and tells customers which plan you’re on. On Brevo Starter, removing it is a paid add-on.'],
      ['retention', 'Email content kept', '30 days', '30 days', 'Not published',
        'How long you can open the full body of an email in the dashboard and API. After that the body and attachments are deleted, while the recipient, status and every delivery event stay so logs and metrics keep working.'],
      ['mcp', 'MCP server for AI agents', Y + ' 94 tools', Y, Y,
        'Lets ChatGPT, Claude or Cursor send email and check delivery for you. All three have one.'],
      ['sms', 'SMS & WhatsApp', N, N, Y,
        'Brevo is a full marketing suite with SMS, WhatsApp and a CRM. If you need those in one place, Brevo covers more. Delivrie and Resend focus on email.']
    ];
  }
  window.DelivrieCompareRows = function () { return compareRows(CMP_DEFAULT).map(function (r) { return { id: r[0], label: r[1], explain: r[5] }; }); };
  function vs() {
    var site = window.DelivrieSite && window.DelivrieSite.config && window.DelivrieSite.config.compare || {};
    var c = { fx: +site.fx || CMP_DEFAULT.fx, date: site.date || CMP_DEFAULT.date, prices: {} };
    Object.keys(CMP_DEFAULT.prices).forEach(function (k) { var v = site.prices && site.prices[k]; c.prices[k] = v === 0 || +v ? +v : CMP_DEFAULT.prices[k]; });
    var over = site.rows || {};
    var rows = compareRows(c).filter(function (r) { return !(over[r[0]] && over[r[0]].hidden); }).map(function (r) {
      var o = over[r[0]] || {};
      return [r[0], o.label ? escH(o.label) : r[1], o.delivrie ? escH(o.delivrie) : r[2], o.resend ? escH(o.resend) : r[3], o.brevo ? escH(o.brevo) : r[4], o.explain ? escH(o.explain) : r[5]];
    });
    var head = '<thead><tr><th></th>' + BRANDS.map(function (b, i) {
      // Resend and Brevo logos are wordmarks, so their name only shows if the image fails to load.
      return '<th class="' + (i ? '' : 'us') + '"><span class="brand-h' + (b[3] ? ' wm' : '') + '"><img src="' + b[2] + '" alt="' + b[1] + '" onerror="this.nextElementSibling.hidden=false;this.remove()"><span' + (b[3] ? ' hidden' : '') + '>' + b[1] + '</span></span></th>';
    }).join('') + '</tr></thead>';
    $('#vs-table').innerHTML = head + '<tbody>' + rows.map(function (r, i) {
      return '<tr class="vr"><th scope="row"><span>' + r[1] + '</span><button class="explain" aria-expanded="false" aria-controls="ex-' + i + '">Explain' + arrow + '</button></th>' +
        '<td class="us">' + r[2] + '</td><td>' + r[3] + '</td><td>' + r[4] + '</td></tr>' +
        '<tr class="ex" id="ex-' + i + '" hidden><td colspan="4"><p>' + r[5] + '</p></td></tr>';
    }).join('') + '</tbody>';
    $('#vs-note').textContent = 'Resend and Brevo prices are from their websites on ' + c.date + ' and can change. Each column shows the cheapest plan that covers the volume; Brevo prices are its Starter plan, billed monthly.';
  }

  function extra() {
    var p = P[cur];
    $('#mkt-line').innerHTML = '<b>Marketing broadcasts</b> are free up to 1,000 contacts, then from ' + m(p.growth) + ' a month for 5,000. <b>Enterprise</b> gets custom volume, dedicated IPs and an SLA: <a href="/contact-sales">talk to sales</a>.';
  }

  var FAQ = [
    ['What counts as an email?', 'Each recipient is one email. One message to a To, a CC and a BCC address counts as three.'],
    ['What happens if I go over my plan?', 'On Starter, Pro and Scale we keep sending and bill the extra per 1,000 at the end of the month. On Free, sending pauses until the next day or month.'],
    ['How do I pay?', 'By card in US dollars, through Stripe. Sales tax or VAT is added where it applies, based on your billing address.'],
    ['How do yearly plans work?', 'You pay for ten months and get twelve, billed upfront.'],
    ['Can I change plans anytime?', 'Yes. Upgrades start right away. If you downgrade, you keep your plan until the end of the period you paid for.']
  ];
  function faq() {
    $('#faq-list').innerHTML = FAQ.map(function (f) { return '<details><summary>' + f[0] + '<span class="pm"></span></summary><div class="ans"><p>' + f[1] + '</p></div></details>'; }).join('');
  }

  function render(animate?: boolean) {
    $$('[data-mode]').forEach(function (b) { b.classList.toggle('on', b.dataset.mode === mode); });
    $$('[data-view]').forEach(function (b) { b.classList.toggle('on', b.dataset.view === view); b.setAttribute('aria-selected', b.dataset.view === view); });
    $('#v-plans').hidden = view !== 'plans';
    $('#v-compare').hidden = view !== 'compare';
    $('#billing').style.display = view === 'plans' ? '' : 'none';
    plans(); payg(); extra(); vs();
    if (animate && !calm) $$(view === 'plans' ? '#plan-grid .plan, #payg' : '#vs-table').forEach(function (el, i) { el.style.animation = 'none'; void el.offsetWidth; el.style.animation = 'rise .5s ' + (i * 50) + 'ms cubic-bezier(.2,.8,.2,1) both'; });
  }
  $$('[data-view]').forEach(function (b) { b.addEventListener('click', function () { view = b.dataset.view; try { history.replaceState(null, '', (view === 'compare' ? '/compare' : '/pricing') + location.search); } catch (e) {} document.title = view === 'compare' ? 'Resend vs Brevo vs Delivrie: email API pricing compared (2026)' : 'Pricing: free email API, Pro from $10 a month · Delivrie'; render(true); }); });
  $$('[data-mode]').forEach(function (b) { b.addEventListener('click', function () { mode = b.dataset.mode; render(true); }); });
  document.addEventListener('click', function (e: any) {
    var b = e.target.closest('.explain'); if (!b) return;
    var row = document.getElementById(b.getAttribute('aria-controls')), open = b.getAttribute('aria-expanded') !== 'true';
    b.setAttribute('aria-expanded', open); row.hidden = !open;
  });
  window.addEventListener('dlv:site', function () { vs(); });
  faq(); render(false);

  var sys = $('#sys');
  if (sys && window.fetch) fetch('/api/public/status').then(function (r) { return r.json(); }).then(function (s) { if (s.status !== 'operational' || s.sending === false) { sys.classList.add('down'); sys.querySelector('span').textContent = 'Sending degraded'; } }).catch(function () {});
})();
