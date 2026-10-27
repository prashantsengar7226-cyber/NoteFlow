'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  CreditCard,
  FileText,
  Gift,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserRound,
  Zap,
} from 'lucide-react';
import { FEATURE_LIST, FREE_PLAN } from '@/lib/plans';

type AccountData = {
  accountId?: string;
  role?: 'user'|'admin'|'superuser';
  featureRouting?: boolean;
  weeklyAI?: {used:number;limit:number|null;resetAt:number}|null;
  profile: { name: string; email: string; joinedAt: number };
  plan: {
    id: string;
    unlimited?: boolean;
    name: string;
    access: string;
    daily: { ai: number; youtube: number };
    limits: { notes: number };
  };
  billing: {
    enabled: boolean;
    launch: boolean;
    model: string;
    amount: number | null;
    currency: string;
    testMode: boolean;
  };
  usage: { ai: number; youtube: number };
  resetAt: number;
  stats: { notes: number; collections: number; favorites: number };
  purchases: { id: string; amount: number; currency: string; state: string; created_at: number }[];
};
type Checkout = {
  purchaseId: string;
  orderId: string;
  key: string;
  amount: number;
  currency: string;
  testMode: boolean;
};
type Payment = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};
type RazorpayInstance = { open(): void; on(event: 'payment.failed', callback: () => void): void };
type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance;
let scriptPromise: Promise<RazorpayConstructor> | null = null;
function loadCheckout() {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<RazorpayConstructor>((resolve, reject) => {
    const current = () => (window as unknown as { Razorpay?: RazorpayConstructor }).Razorpay;
    if (current()) return resolve(current()!);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    const timer = setTimeout(() => {
      script.remove();
      scriptPromise = null;
      reject(new Error('Checkout took too long to load. Please try again.'));
    }, 15000);
    script.onload = () => {
      clearTimeout(timer);
      if (current()) resolve(current()!);
      else {
        scriptPromise = null;
        reject(new Error('Checkout is unavailable.'));
      }
    };
    script.onerror = () => {
      clearTimeout(timer);
      script.remove();
      scriptPromise = null;
      reject(new Error('Checkout could not load. Please try again.'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}
async function request<T>(url: string, payload?: unknown) {
  const response = await fetch(url, {
    method: payload ? 'POST' : 'GET',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const data = await response.json();
  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : 'The request could not be completed.';
    throw new Error(message);
  }
  return data as T;
}
const money = (amount: number, currency: string) =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount / 100);

export function AccountPanel({
  view,
  onUpdated,
}: {
  view: 'plans' | 'account';
  onUpdated: () => void;
}) {
  const [data, setData] = useState<AccountData | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setData(await request<AccountData>('/api/account'));
  }, []);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    request<AccountData>('/api/account')
      .then((value) => {
        if (alive) setData(value);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [view]);
  async function purchase() {
    if (!data?.billing.enabled || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const Razorpay = await loadCheckout();
      const order = await request<Checkout>('/api/billing', { action: 'checkout' });
      const checkout = new Razorpay({
        key: order.key,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: 'Noteflow',
        description: 'Pro access · one-time payment',
        theme: { color: '#4255d4' },
        modal: {
          ondismiss: () => {
            setBusy(false);
            setNotice(
              'Checkout closed. If you paid, use Refresh status below before trying again.',
            );
            void refresh().catch(() => {});
          },
        },
        handler: async (payment: Payment) => {
          try {
            const result = await request<{ state: string }>('/api/billing', {
              action: 'verify',
              payment: { ...payment, purchaseId: order.purchaseId },
            });
            setNotice(
              result.state === 'paid'
                ? 'Payment verified. Pro access is now active.'
                : 'Payment is awaiting confirmation. Refresh its status below; do not pay again.',
            );
            await refresh();
            onUpdated();
          } catch (e) {
            setError((e as Error).message + ' Check purchase status before paying again.');
          } finally {
            setBusy(false);
          }
        },
      });
      checkout.on('payment.failed', () => {
        setError(
          'Payment did not complete. No Pro access was granted. You can retry within checkout or close it.',
        );
      });
      checkout.open();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  async function refreshPayment(id: string) {
    setBusy(true);
    setError('');
    try {
      const result = await request<{ state: string }>('/api/billing', {
        action: 'refresh',
        purchaseId: id,
      });
      await refresh();
      onUpdated();
      setNotice(
        result.state === 'paid'
          ? 'Payment confirmed. Your Pro access is active.'
          : `Purchase status: ${result.state}.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const pro = data?.plan.id === 'pro_once';
  return (
    <main id="workspace-main" tabIndex={-1} className="content account-content page-enter">
      <div className="product-heading">
        <div>
          <span className="eyebrow">{view === 'plans' ? 'PLANS & ACCESS' : 'YOUR ACCOUNT'}</span>
          <h1>
            {view === 'plans' ? 'Powerful tools. A simple plan.' : 'Your workspace, at a glance.'}
          </h1>
          <p className="lead">
            {view === 'plans'
              ? data?.billing.launch === false
                ? 'Choose how you access the Noteflow toolkit.'
                : 'All available features are included during the free launch.'
              : 'Manage your access, understand your usage, and keep track of purchases.'}
          </p>
        </div>
        <span className="workspace-secure">
          <ShieldCheck size={15} /> Private to you
        </span>
      </div>
      {error && (
        <div className="inline-error" role="alert">
          {error}
          <button
            className="text-button"
            onClick={() => {
              setError('');
              void refresh().catch((e) => setError(e.message));
            }}
          >
            Retry <RefreshCw size={14} />
          </button>
        </div>
      )}
      {notice && (
        <div className="account-notice" role="status">
          <CheckCircle2 size={17} />
          {notice}
        </div>
      )}
      {loading ? (
        <div className="account-loading" role="status">
          <LoaderCircle className="spin" size={22} />
          Loading account…
        </div>
      ) : (
        data && (
          <>
            {data.billing.launch && (
              <div className="launch-notice">
                <span className="launch-icon">
                  <Gift size={21} />
                </span>
                <div>
                  <strong>Full access. Free while we launch.</strong>
                  <p>
                    Use every available study tool within the allowances shown below. NoteFlow does not
                    charge during launch. A connected personal AI provider may charge for requests.
                  </p>
                </div>
                <span className="launch-label">FREE LAUNCH</span>
              </div>
            )}
            {data.billing.testMode && (
              <div className="inline-error">
                Test checkout only. This environment does not collect real payments.
              </div>
            )}
            {view === 'account' && (
              <section className="account-profile">
                <span className="account-avatar">
                  <UserRound size={27} />
                </span>
                <div>
                  <h2>{data.profile.name}</h2>
                  <p>{data.profile.email}</p>
                  <p>Role: <strong>{data.role || 'user'}</strong></p>
                  <small>Account ID: {data.accountId}</small>
                  {(data.role==='admin'||data.role==='superuser')&&<p><a href="/admin">Open administration dashboard</a></p>}
                  <small>
                    Member since{' '}
                    {new Date(data.profile.joinedAt).toLocaleDateString(undefined, {
                      month: 'long',
                      year: 'numeric',
                    })}
                  </small>
                </div>
                <span className="account-plan-badge">
                  {data.plan.name}
                  {data.billing.launch ? ' · Full access' : pro ? ' · One-time' : ' · Basic access'}
                </span>
              </section>
            )}
            {view === 'plans' && (
              <div className="pricing-grid">
                <section className="price-card current-plan">
                  <div className="price-card-top">
                    <span className="price-icon">
                      <Gift size={21} />
                    </span>
                    <span className="plan-label">{!pro ? 'YOUR CURRENT PLAN' : 'FREE PLAN'}</span>
                  </div>
                  <h2>Free</h2>
                  <p>
                    {data.billing.launch
                      ? 'Everything you need to start learning better.'
                      : 'A personal home for your notes and basic summaries.'}
                  </p>
                  <div className="price">
                    ₹0
                    <span>
                      {data.billing.launch ? 'during the free launch' : 'no payment required'}
                    </span>
                  </div>
                  <div className="price-status">
                    <CheckCircle2 size={16} />
                    {data.billing.launch ? 'All available tools included' : 'Basic tools included'}
                  </div>
                  <ul>
                    {(data.billing.launch
                      ? FEATURE_LIST
                      : [
                          'Private notes and collections',
                          'Basic source-excerpt summaries',
                          'Saved study material and exports',
                        ]
                    ).map((feature) => (
                      <li key={feature}>
                        <Check size={15} />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <p className="price-footnote">
                    {data.plan.unlimited ? 'Administrator access has no product operation cap. ' : data.featureRouting ? 'AI study tools have no daily product cap. ' : `${data.billing.launch ? FREE_PLAN.daily.ai : 0} AI operations per day. `}
                    {data.plan.unlimited ? 'YouTube imports have no product cap. ' : `${data.billing.launch ? FREE_PLAN.daily.youtube : 0} YouTube imports per day${data.billing.launch ? ' during launch' : ''}. `}Provider quotas and safety limits still apply.
                  </p>
                </section>
                <section className="price-card future-plan">
                  <div className="price-card-top">
                    <span className="price-icon">
                      <Sparkles size={21} />
                    </span>
                    <span className="plan-label">
                      {pro
                        ? 'ACTIVE ON YOUR ACCOUNT'
                        : data.billing.enabled
                          ? 'ONE-TIME UPGRADE'
                          : 'PLANNED FOR LATER'}
                    </span>
                  </div>
                  <h2>Pro</h2>
                  <p>A single payment for continued access to the full toolkit.</p>
                  <div className={`price ${data.billing.amount === null ? 'price-pending' : ''}`}>
                    {data.billing.amount !== null
                      ? money(data.billing.amount, data.billing.currency)
                      : 'Price to be announced'}
                    <span>one payment · no automatic renewal</span>
                  </div>
                  <div className="price-status">
                    <ShieldCheck size={16} />
                    {pro ? 'Payment verified' : 'Account-based access'}
                  </div>
                  <ul>
                    <li>
                      <Check size={15} />
                      Full study toolkit
                    </li>
                    <li>
                      <Check size={15} />
                      Access tied to your signed-in account
                    </li>
                    <li>
                      <Check size={15} />
                      Purchase history and payment verification
                    </li>
                    <li>
                      <Check size={15} />
                      {data.plan.unlimited ? 'Administrator access without product allowances' : data.featureRouting ? `AI tools without a daily product cap; ${FREE_PLAN.daily.youtube} YouTube imports daily` : `${FREE_PLAN.daily.ai} AI operations and ${FREE_PLAN.daily.youtube} YouTube imports daily`}
                    </li>
                  </ul>
                  <button
                    className="primary"
                    disabled={busy || pro || !data.billing.enabled}
                    onClick={purchase}
                  >
                    {busy ? <LoaderCircle className="spin" size={16} /> : <CreditCard size={16} />}
                    {pro
                      ? 'Pro access active'
                      : data.billing.enabled
                        ? 'Continue to secure checkout'
                        : 'Not on sale yet'}
                    {data.billing.enabled && !pro && <ArrowRight size={15} />}
                  </button>
                  <p className="price-footnote">
                    {data.billing.launch
                      ? 'There is nothing to buy today. You already have access to all available features.'
                      : 'AI and import limits apply. One-time access does not include unlimited provider usage.'}
                  </p>
                </section>
              </div>
            )}
            <section className="account-usage">
              <div className="section-top">
                <div>
                  <h2>Your NoteFlow allowance</h2>
                  <p className="muted">
                    {data.featureRouting ? 'Weekly summaries and insights reset ' : 'Resets '}
                    {new Date(data.featureRouting ? data.weeklyAI?.resetAt ?? data.resetAt : data.resetAt).toLocaleString(undefined, {
                      hour: 'numeric',
                      minute: '2-digit',
                      month: 'short',
                      day: 'numeric',
                    })}
                    . Basic summaries and downloads use no AI allowance.
                  </p>
                </div>
                <span className="account-plan-badge">{data.plan.name}</span>
              </div>
              <div className="usage-card-grid">
                {[
                  {
                    label: data.featureRouting ? 'Summaries & insights this week' : 'AI operations',
                    icon: Sparkles,
                    used: data.featureRouting ? data.weeklyAI?.used ?? 0 : data.usage.ai,
                    max: data.plan.unlimited ? null : data.featureRouting ? data.weeklyAI?.limit ?? null : data.plan.daily.ai,
                  },
                  {
                    label: 'YouTube imports',
                    icon: Zap,
                    used: data.usage.youtube,
                    max: data.plan.unlimited ? null : data.plan.daily.youtube,
                  },
                  {
                    label: 'Saved notes',
                    icon: FileText,
                    used: data.stats.notes,
                    max: data.plan.unlimited ? null : data.plan.limits.notes,
                  },
                ].map((item) => (
                  <div className="usage-card" key={item.label}>
                    <span>
                      <item.icon size={17} />
                      {item.label}
                    </span>
                    <strong>
                      {item.used.toLocaleString()}
                      <small>{item.max === null ? ' · no product cap' : `/ ${item.max.toLocaleString()}`}</small>
                    </strong>
                    {item.max !== null && <progress
                      max={Math.max(item.max, 1)}
                      value={Math.min(item.used, item.max)}
                      aria-label={`${item.label} used`}
                    />}
                    <p>{item.max === null ? 'Site safety limits apply' : `${Math.max(0, item.max - item.used).toLocaleString()} remaining`}</p>
                  </div>
                ))}
              </div>
              <p className="usage-note">
                {data.featureRouting ? 'Weekly summaries and insights reset Monday at 00:00 IST. Each full summary counts once, including automatic retries. Small AI tools have no daily cap; provider limits apply. YouTube imports reset daily.' : 'Long sources can use several AI operations. Shared provider limits can be reached before your allowance.'} Personal keys have no NoteFlow AI allowance; provider limits and charges apply.
              </p>
            </section>
            <section className="purchase-history">
              <div className="section-top">
                <div>
                  <h2>Purchase history</h2>
                  <p className="muted">One-time purchases associated with this account.</p>
                </div>
                <CreditCard size={20} />
              </div>
              {data.purchases.length ? (
                <div className="purchase-table">
                  {data.purchases.map((item) => (
                    <article key={item.id}>
                      <div>
                        <strong>Noteflow Pro</strong>
                        <small>
                          {new Date(item.created_at).toLocaleDateString()} · {item.id.slice(0, 8)}
                        </small>
                      </div>
                      <span>{money(item.amount, item.currency)}</span>
                      <span className={`purchase-state state-${item.state}`}>
                        {item.state === 'paid'
                          ? 'Paid'
                          : item.state === 'created'
                            ? 'Awaiting payment'
                            : item.state === 'creating'
                              ? 'Preparing'
                              : item.state}
                      </span>
                      {item.state !== 'refunded' && item.state !== 'disputed' && (
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() => refreshPayment(item.id)}
                        >
                          <RefreshCw size={13} />
                          Refresh status
                        </button>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="no-purchases">
                  <span>
                    <CreditCard size={22} />
                  </span>
                  <div>
                    <h3>No payments yet</h3>
                    <p>
                      {data.billing.launch
                        ? 'You’re on the free launch plan. No card or subscription is attached.'
                        : 'Your verified one-time purchases will appear here.'}
                    </p>
                  </div>
                </div>
              )}
            </section>
            {view === 'plans' && (
              <section className="plan-faq">
                <h2>A few things to know</h2>
                <details>
                  <summary>Is this a monthly subscription?</summary>
                  <p>
                    No. The planned Pro upgrade uses a one-time payment with no recurring billing.
                    The final price will be displayed before checkout becomes available.
                  </p>
                </details>
                <details>
                  <summary>Can I use all the tools for free right now?</summary>
                  <p>
                    {data.billing.launch
                      ? 'Yes. Available tools are included during the free launch. The allowances shown above and provider capacity still apply.'
                      : 'The free launch has ended. Basic tools and saved work remain available; Pro enables AI tools and YouTube imports.'}
                  </p>
                </details>
                <details>
                  <summary>Does a one-time purchase mean unlimited AI?</summary>
                  <p>
                    No. Each AI request uses provider capacity. Your plan includes the
                    allowances shown above, subject to shared service capacity.
                  </p>
                </details>
                <details>
                  <summary>What if a payment is interrupted?</summary>
                  <p>
                    Check purchase history and use Refresh status before paying again. Access is
                    granted only after the server verifies a captured payment. Full refunds and
                    payment disputes remove paid access.
                  </p>
                </details>
              </section>
            )}
          </>
        )
      )}
    </main>
  );
}
