import { Icon, I } from "./Icon";
import { Mark } from "./Logo";

/* Product mockups drawn in HTML — they read like the real screens and stay
   sharp at any size. Decorative: each has an aria-label saying what it shows. */

export function EditorMock() {
  return (
    <div className="panel" role="img" aria-label="The theme editor: product page blocks being rearranged beside a live preview">
      <div className="panel__head">
        <b>Customize</b> · Product page
        <span className="live">Draft saved</span>
      </div>
      <div className="editor">
        <div className="editor__side">
          <small>Blocks</small>
          <div className="block"><span className="grip">⋮⋮</span> Title <em>Large</em></div>
          <div className="block is-drag"><span className="grip">⋮⋮</span> Size &amp; colour <em>Pills</em></div>
          <div className="block"><span className="grip">⋮⋮</span> Price</div>
          <div className="block"><span className="grip">⋮⋮</span> Add to cart</div>
          <div className="block"><span className="grip">⋮⋮</span> Reviews <em>★ 4.8</em></div>
          <div className="block is-off"><span className="grip">⋮⋮</span> Badges <em>Hidden</em></div>
        </div>
        <div className="editor__preview">
          <img src="/showcase/atelier-product.webp" alt="" width="1440" height="1000" loading="lazy" />
          <span className="editor__cursor">Drag to reorder</span>
        </div>
      </div>
    </div>
  );
}

export function CheckoutMock() {
  return (
    <div className="ck" role="img" aria-label="One-Click Checkout: a verified mobile number, a saved address and UPI selected, with a new order alert">
      <div className="ck__sheet">
        <div className="ck__head">
          <span>Loomwear</span>
          <em><Icon d={I.shield} /> Secure checkout</em>
        </div>
        <div className="ck__sum"><span>2 items</span><strong>₹2,299</strong></div>
        <ol className="ck__steps">
          <li className="done">Mobile</li>
          <li className="done">Address</li>
          <li className="now">Payment</li>
        </ol>
        <div className="ck__opt is-on">
          <i />
          <span><b>UPI</b><span>Pay by any UPI app</span></span>
          <span className="ck__brands"><Mark brand="googlepay" size={18} /><Mark brand="phonepe" size={18} /><Mark brand="paytm" size={18} /></span>
        </div>
        <div className="ck__opt">
          <i />
          <span><b>Cards</b><span>Visa, Mastercard, RuPay</span></span>
          <span className="ck__brands"><Mark brand="visa" size={18} /><Mark brand="mastercard" size={18} /></span>
        </div>
        <div className="ck__opt">
          <i />
          <span><b>Cash on delivery</b><span>Pay when it arrives</span></span>
        </div>
        <div className="ck__pay"><Icon d={I.lock} /> Pay ₹2,299</div>
      </div>
      <div className="ck__otp">
        Code sent to +91 98765 •••01
        <div>{["4", "8", "1", "2", "9", "6"].map((d, i) => <b key={i}>{d}</b>)}</div>
      </div>
      <div className="ck__toast">
        <span className="toast__icon"><Icon d={I.bell} /></span>
        <span><strong>New order #1043 · ₹2,299</strong><span>Ananya S. · UPI · just now</span></span>
      </div>
    </div>
  );
}

export function FlowMock() {
  return (
    <div className="panel" role="img" aria-label="A Flow automation: when an order is delivered, wait three days, check it wasn't refunded, then email a review request">
      <div className="panel__head">
        <b>Flow</b> · Ask for a review
        <span className="live">On · 128 runs</span>
      </div>
      <div className="flow">
        <div className="fnode fnode--trigger">
          <span className="fnode__icon"><Icon d={I.box} /></span>
          <span><small>When</small><b>Order delivered</b></span>
        </div>
        <span className="fline" />
        <div className="fnode fnode--wait">
          <span className="fnode__icon"><Icon d={I.clock} /></span>
          <span><small>Step 1 · Wait</small><b>3 days</b></span>
        </div>
        <span className="fline" />
        <div className="fnode fnode--cond">
          <span className="fnode__icon"><Icon d={I.branch} /></span>
          <span><small>Step 2 · Condition</small><b>Not refunded</b></span>
        </div>
        <span className="fline" />
        <div className="fnode fnode--mail">
          <span className="fnode__icon"><Icon d={I.mail} /></span>
          <span><small>Step 3 · Email customer</small><b>How&rsquo;s your linen shirt?</b></span>
          <span className="sent">Sent</span>
        </div>
        <div className="flow__inbox">
          <small>Loomwear · to ananya@…</small>
          <b>How&rsquo;s your Pure Linen Shirt, Ananya?</b>
          <p>Your order #1043 arrived a few days ago — we&rsquo;d love to know what you think.</p>
        </div>
      </div>
    </div>
  );
}

export function HelpMock() {
  return (
    <div className="panel" role="img" aria-label="The Help assistant answering how to connect a domain, with steps">
      <div className="panel__head">
        <b>Help</b> · Answers in seconds
        <span className="live">Team online</span>
      </div>
      <div className="chat">
        <div className="msg msg--me">My domain isn&rsquo;t working yet — I added it yesterday</div>
        <div className="msg msg--ai">
          Your domain <b>shop.loomwear.in</b> is connected but the DNS isn&rsquo;t live yet. In your domain provider:
          <ol>
            <li>Delete the old <b>A record</b> for <b>shop</b></li>
            <li>Add the record shown in <b>Settings ▸ Domains</b></li>
            <li>Come back and press <b>Check</b> — SSL is automatic</li>
          </ol>
        </div>
        <div className="chat__foot">
          Did this solve it?
          <span className="hi">Yes, thanks</span>
          <span>I still need help</span>
        </div>
      </div>
    </div>
  );
}

export function DashboardMock() {
  const bars = [34, 52, 41, 66, 58, 72, 49, 80, 63, 90, 76, 96];
  return (
    <div className="panel" role="img" aria-label="The seller dashboard: today's sales, orders and visitors, with a sales chart">
      <div className="dash">
        <div className="dash__side">
          <span className="on">Home</span>
          <span>Orders</span>
          <span>Products</span>
          <span>Customers</span>
          <span>Analytics</span>
          <small>Apps</small>
          <span>Flow</span>
          <span>One-Click Checkout</span>
          <span>Phone Login</span>
        </div>
        <div className="dash__main">
          <p className="dash__hi">Good evening, Ananya</p>
          <div className="tiles">
            <div><small>Sales today</small><b>₹18,240</b><em>▲ 24%</em></div>
            <div><small>Orders</small><b>31</b><em>▲ 9</em></div>
            <div><small>Visitors now</small><b>46</b><em>● live</em></div>
          </div>
          <div className="bars" aria-hidden="true">
            {bars.map((h, i) => (
              <i key={i} className={i === bars.length - 1 ? "hl" : ""} style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function StorefrontMock() {
  return (
    <div className="browser">
      <div className="browser__bar">
        <span className="browser__dots" aria-hidden="true"><i /><i /><i /></span>
        <span className="browser__url">loomwear.oyklane.com</span>
      </div>
      <div className="browser__screen">
        <img src="/showcase/atelier.webp" alt="A clothing store built on Oyklane with the Atelier theme" width="1440" height="1000" fetchPriority="high" />
      </div>
    </div>
  );
}
