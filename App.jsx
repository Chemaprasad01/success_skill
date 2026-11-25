import React, { useEffect, useState } from 'react';
import { supabase, configured } from './supabase';

const money = n => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n || 0);
const ranks = ['Platinum','Silver','Gold','Diamond','Crown'];

export default function App(){
  const [session,setSession] = useState(null);
  const [profile,setProfile] = useState(null);
  const [product,setProduct] = useState(null);
  const [orders,setOrders] = useState([]);
  const [commissions,setCommissions] = useState([]);
  const [referrals,setReferrals] = useState([]);
  const [adminOrders,setAdminOrders] = useState([]);
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  const [fullName,setFullName] = useState('');
  const [referral,setReferral] = useState(new URLSearchParams(location.search).get('ref') || '');
  const [mode,setMode] = useState('login');
  const [message,setMessage] = useState('');
  const [busy,setBusy] = useState(false);
  const [walletTransactions, setWalletTransactions] = useState([]);
  const [rankUpgrades, setRankUpgrades] = useState([]);
const [withdrawals, setWithdrawals] = useState([]);
const [withdrawalDebits, setWithdrawalDebits] = useState([]);
const [adminWithdrawals, setAdminWithdrawals] = useState([]);
const [withdrawAmount, setWithdrawAmount] = useState('');
const [payoutMethod, setPayoutMethod] = useState('upi');
const [upiId, setUpiId] = useState('');
const [accountHolder, setAccountHolder] = useState('');
const [accountNumber, setAccountNumber] = useState('');
const [ifsc, setIfsc] = useState('');
const [payoutReferences, setPayoutReferences] = useState({});


  useEffect(()=>{
    if(!configured) return;
    supabase.auth.getSession().then(({data})=>setSession(data.session));
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_e,s)=>setSession(s));
    return ()=>subscription.unsubscribe();
  },[]);
  useEffect(()=>{ if(session) load(); else {setProfile(null);setOrders([]);setCommissions([])} },[session])

async function load() {
  try {
    const { data: { user }, error: authError } =
      await supabase.auth.getUser();

    if (authError) throw authError;
    if (!user) throw new Error('No authenticated user found.');

    const uid = user.id;

    const [
      { data: p, error: profileError },
      { data: o, error: ordersError },
      { data: c, error: commissionError },
      { data: refs, error: referralError }
    ] = await Promise.all([
      supabase.from('profiles')
        .select('*')
        .eq('id', uid)
        .single(),

      supabase.from('course_purchases')
        .select('id,customer_id,course_name,amount_paise,status,created_at,provider_payment_id')
        .eq('customer_id', uid)
        .order('created_at', { ascending: false }),

      supabase.from('commission_events')
        .select('id,referrer_id,customer_id,commission_paise,sequence_number,payout_destination,customer_rank,created_at,source_type')
        .eq('referrer_id', uid)
        .order('created_at', { ascending: false }),

      supabase.rpc('get_my_referrals'),

    ]);

    if (profileError) throw profileError;
    if (ordersError) throw ordersError;
    if (commissionError) throw commissionError;
    if (referralError) throw referralError;

setProfile(p); 
    setOrders(o || []);
    setCommissions(c || []);
    setReferrals(refs || []);
    const { data: walletData, error: walletError } = await supabase
  .from('wallet_ledger')
  .select('id, member_id, commission_event_id, wallet_type, amount_paise, created_at')
  .eq('member_id', uid)
  .order('created_at', { ascending: false });

if (walletError) throw walletError;
setWalletTransactions(walletData || []);

const { data: upgradeData, error: upgradeError } = await supabase
  .from('rank_upgrades')
  .select('id, customer_id, previous_rank, new_rank, amount_paise, status, verified_at, created_at')
  .eq('customer_id', uid)
  .order('created_at', { ascending: false });

if (upgradeError) throw upgradeError;
setRankUpgrades(upgradeData || []); 
    
const { data: withdrawalData, error: withdrawalError } = await supabase
  .from('withdrawal_requests')
  .select('id, amount_paise, payout_method, status, admin_note, created_at, reviewed_at, paid_at')
  .eq('member_id', uid)
  .order('created_at', { ascending: false });

if (withdrawalError) throw withdrawalError;
setWithdrawals(withdrawalData || []);

const { data: debitData, error: debitError } = await supabase
  .from('withdrawal_debits')
  .select('id, withdrawal_request_id, amount_paise, paid_at')
  .eq('member_id', uid);

if (debitError) throw debitError;
setWithdrawalDebits(debitData || []);

if (p.role === 'admin') {
  const { data: allWithdrawals, error: allWithdrawalError } =
    await supabase
      .from('withdrawal_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

  if (allWithdrawalError) throw allWithdrawalError;
  setAdminWithdrawals(allWithdrawals || []);
} else {
  setAdminWithdrawals([]);
}


    if (p.role === 'admin') {
      const { data: all, error: adminError } =
        await supabase.from('course_purchases')
          .select('id,customer_id,course_name,amount_paise,status,created_at,provider_payment_id')
          .order('created_at', { ascending: false })
          .limit(100);

      if (adminError) throw adminError;

      setAdminOrders(all || []);
    } else {
      setAdminOrders([]);
    }

    setMessage('');

  } catch (error) {
    console.error('Dashboard loading error:', error);
    setMessage(error.message || 'Dashboard loading failed.');
  }
}


async function authSubmit(e){
    e.preventDefault(); setBusy(true); setMessage('');
    try{
      if(mode==='signup'){
        const {error} = await supabase.auth.signUp({email,password,options:{data:{full_name:fullName,referral_code:referral.trim()||null}}});
        if(error) throw error;
        setMessage('Account created. Check your email if confirmation is enabled, then sign in.');
      }else{
        const {error} = await supabase.auth.signInWithPassword({email,password});
        if(error) throw error;
      }
    }catch(e){setMessage(e.message)} finally{setBusy(false)}
  }
  async function loadRazorpay(){
    if(window.Razorpay) return true;
    return await new Promise(resolve=>{
      const script=document.createElement('script');
      script.src='https://checkout.razorpay.com/v1/checkout.js';
      script.onload=()=>resolve(true); script.onerror=()=>resolve(false);
      document.body.appendChild(script);
    });
  }
  async function placeOrder(){
    if (orders.some(
  o => String(o.status || '').toLowerCase() === 'verified'
)) {
  setMessage('You have already purchased the eBook. Another purchase is not allowed.');
  return;
    }
    setBusy(true); setMessage('Preparing secure checkout…');
    try{
      const loaded=await loadRazorpay();
      if(!loaded) throw new Error('Could not load Razorpay Checkout. Check your internet connection and retry.');
      const {data:orderData,error}=await supabase.functions.invoke('create_razorpay_order');
      if(error) throw error;
      if(!orderData?.order_id || !orderData?.key_id || !orderData?.local_order_id) throw new Error(orderData?.error || 'Could not create payment order.');
      const checkout=new window.Razorpay({
        key:orderData.key_id, amount:orderData.amount, currency:'INR', name:'SUCCESS SKILL',
        description:'SUCCESS SKILL eBook', order_id:orderData.order_id,
        prefill:{name:profile?.full_name||'',email:session.user.email||''},
        theme:{color:'#182b45'},
        handler:async response=>{
          setBusy(true); setMessage('Verifying payment securely…');
          try{
            const {data,error}=await supabase.functions.invoke('verify-razorpay-payment',{body:{local_order_id:orderData.local_order_id,razorpay_order_id:response.razorpay_order_id,razorpay_payment_id:response.razorpay_payment_id,razorpay_signature:response.razorpay_signature}});
            if(error) throw error;
            if(!data?.verified) throw new Error(data?.error||'Payment is not yet captured. Please wait for confirmation.');
            setMessage('Payment verified! Your eBook download is now unlocked.');
            await load();
          }catch(err){setMessage(err.message||'Payment verification is pending. The secure webhook will update your order after capture.');await load();}
          finally{setBusy(false);}
        },
        modal:{ondismiss:()=>{setBusy(false);setMessage('Checkout closed. If you completed payment, your order will update after Razorpay confirms it.');load();}}
      });
      checkout.on('payment.failed',response=>{setBusy(false);setMessage(response?.error?.description||'Payment failed. Please try again.');});
      setBusy(false); setMessage('Complete your payment in Razorpay Checkout.'); checkout.open();
    }catch(e){setBusy(false);setMessage(e.message||'Could not start checkout.');}
  }
  async function downloadBook(){
    setBusy(true); setMessage('');
    try{
      const {data,error} = await supabase.functions.invoke('download-ebook');
      if(error) throw error;
      if(!data?.download_url) throw new Error(data?.error || 'Download is not available yet.')
      window.open(data.download_url,'_blank','noopener,noreferrer'); 
    }catch(e){setMessage(e.message || 'Download failed.')}
    finally{setBusy(false)}
  }
  async function updateOrder(id,status,retail_verified){
    setBusy(true);
    const {error} = await supabase.from('orders').update({status,retail_verified}).eq('id',id);
    setBusy(false);
    setMessage(error ? error.message : 'Order updated.');
    await load();
  }
  
const mainWalletCredits = walletTransactions
  .filter(t => t.wallet_type === 'withdrawable')
  .reduce((sum, t) => sum + Number(t.amount_paise || 0), 0);

const paidWithdrawals = withdrawalDebits
  .reduce((sum, d) => sum + Number(d.amount_paise || 0), 0);

const reservedWithdrawals = withdrawals
  .filter(w => ['pending', 'approved'].includes(w.status))
  .reduce((sum, w) => sum + Number(w.amount_paise || 0), 0);

const mainWalletAvailable = Math.max(
  0,
  mainWalletCredits - paidWithdrawals - reservedWithdrawals
);

const rankUpgradeCredits = walletTransactions
  .filter(t => t.wallet_type === 'self_upgrade')
  .reduce((sum, t) => sum + Number(t.amount_paise || 0), 0);

async function submitWithdrawal(e) {
  e.preventDefault();
  setBusy(true);
  setMessage('');

  try {
    const amountPaise = Math.round(Number(withdrawAmount) * 100);

    if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
      throw new Error('Enter a valid withdrawal amount.');
    }

    if (amountPaise > mainWalletAvailable) {
      throw new Error('Insufficient available Main Wallet balance.');
    }

    let details = {};

    if (payoutMethod === 'upi') {
      if (!upiId.trim()) throw new Error('Enter your UPI ID.');
      details = { upi_id: upiId.trim() };
    } else {
      if (!accountHolder.trim() || !accountNumber.trim() || !ifsc.trim()) {
        throw new Error('Complete all bank details.');
      }

      details = {
        account_holder: accountHolder.trim(),
        account_number: accountNumber.trim(),
        ifsc: ifsc.trim().toUpperCase()
      };
    }

    const { error } = await supabase.rpc('request_withdrawal', {
      p_amount_paise: amountPaise,
      p_payout_method: payoutMethod,
      p_payout_details: details
    });

    if (error) throw error;

    setWithdrawAmount('');
    setUpiId('');
    setAccountHolder('');
    setAccountNumber('');
    setIfsc('');
    setMessage('Withdrawal request submitted successfully.');
    await load();
  } catch (error) {
    setMessage(error.message || 'Could not submit withdrawal request.');
  } finally {
    setBusy(false);
  }
}

async function reviewWithdrawal(id, decision) {
  setBusy(true);
  setMessage('');

  try {
    const { error } = await supabase.rpc('admin_review_withdrawal', {
      p_request_id: id,
      p_decision: decision,
      p_admin_note: decision === 'rejected'
        ? 'Withdrawal request rejected by admin.'
        : 'Withdrawal request approved.'
    });

    if (error) throw error;

    setMessage(`Withdrawal ${decision} successfully.`);
    await load();
  } catch (error) {
    setMessage(error.message || 'Could not review withdrawal.');
  } finally {
    setBusy(false);
  }
}

async function completeWithdrawal(id) {
  setBusy(true);
  setMessage('');

  try {
    const reference = String(payoutReferences[id] || '').trim();

    if (!reference) {
      throw new Error('Enter the UTR or payout reference.');
    }

    const { error } = await supabase.rpc('admin_complete_withdrawal', {
      p_request_id: id,
      p_payout_reference: reference
    });

    if (error) throw error;

    setPayoutReferences(previous => ({
      ...previous,
      [id]: ''
    }));

    setMessage('Withdrawal marked as paid successfully.');
    await load();
  } catch (error) {
    setMessage(error.message || 'Could not complete payout.');
  } finally {
    setBusy(false);
  }
}

  async function signOut(){await supabase.auth.signOut();setMessage('Signed out.')}
  const totalCommission = commissions.reduce(
  (s, c) => s + Number(c.commission_paise || 0),
  0
) / 100;
  const hasVerifiedPurchase = orders.some(
  o => String(o.status || '').toLowerCase() === 'verified'
);

const rankPriority = {
  Platinum: 1,
  Silver: 2,
  Gold: 3,
  Diamond: 4,
  Crown: 5
};

const isPlatinumOrHigher =
  (rankPriority[profile?.rank] || 0) >= rankPriority.Platinum;

const hideBuyButton = hasVerifiedPurchase;
  
  if(!configured) return <main className="shell"><header><div className="brand">SUCCESS <b>SKILL</b></div><span className="tag">SETUP REQUIRED</span></header><section className="hero"><p className="eyebrow">DIGITAL LEARNING PLATFORM</p><h1>Build skills.<br/><em>Grow with purpose.</em></h1><p>Connect your Supabase project to activate customer accounts, orders and the admin dashboard.</p></section><section className="panel"><h2>Connect Supabase</h2><ol><li>Create a Supabase project.</li><li>Copy <b>.env.example</b> to <b>.env</b>.</li><li>Add your Project URL and anon key.</li><li>Run the SQL setup in <b>supabase/schema.sql</b>.</li></ol><p className="muted">Never put your Supabase service-role key in this frontend.</p></section><footer>SUCCESS SKILL · Starter website</footer></main>;
  return <main className="shell">
    <header><div className="brand">SUCCESS <b>SKILL</b></div>{session?<button className="outline" onClick={signOut}>Sign out</button>:<span className="tag">EBOOK PLATFORM</span>}</header>
    <section className="hero"><p className="eyebrow">LEARN · APPLY · PROGRESS</p><h1>Your next chapter<br/><em>starts here.</em></h1><p>One digital eBook. A clear path to learning and measurable sales performance.</p></section>
    {message && <div className="notice" role="status">{message}</div>}
    {!session ? <section className="auth panel">
      <div className="tabs"><button className={mode==='login'?'tab active':'tab'} onClick={()=>setMode('login')}>Login</button><button className={mode==='signup'?'tab active':'tab'} onClick={()=>setMode('signup')}>Create account</button></div>
      <h2>{mode==='login'?'Welcome back':'Join SUCCESS SKILL'}</h2>
      <form onSubmit={authSubmit}>
        {mode==='signup'&&<label>Full name<input required value={fullName} onChange={e=>setFullName(e.target.value)} autoComplete="name"/></label>}
        <label>Email address<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email"/></label>
        <label>Password<input type="password" minLength="8" required value={password} onChange={e=>setPassword(e.target.value)} autoComplete={mode==='login'?'current-password':'new-password'}/></label>
        {mode==='signup'&&<label>Referral code (optional)<input value={referral} onChange={e=>setReferral(e.target.value)} placeholder="Enter referral code"/></label>}
        <button className="primary" disabled={busy}>{busy?'Please wait…':mode==='login'?'Login':'Create account'}</button>
      </form>
      <p className="muted tiny">Use a valid email. Your account may require email confirmation depending on Supabase settings.</p>
    </section> : <><section className="welcome"><div><p className="eyebrow">MEMBER DASHBOARD</p><h2>Hello, {profile?.full_name || session.user.email}</h2><p className="muted">Referral code: <b>{profile?.referral_code || 'Preparing…'}</b></p></div><span className="rank">{profile?.rank || 'Not Activated'}</span></section>
      <div className="stats">
<section className="panel">
  <p className="eyebrow">MY NETWORK</p>
  <h2>My Referral Team</h2>

  <div className="stat">
    <small>Total direct referrals</small>
    <strong>{referrals.length}</strong>
  </div>

  {ranks.map(rank => {
    const members = referrals.filter(
      r => String(r.referred_user_rank || '').toLowerCase()
        === rank.toLowerCase()
    );

    return (
      <details key={rank} className="referral-group">
        <summary>
          <b>{rank}</b>
          <span>{members.length} customers</span>
        </summary>

        {members.length ? (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Payment</th>
                </tr>
              </thead>
              <tbody>
                {members.map(member => (
                  <tr key={member.referred_user_id}>
                    <td>{member.referred_user_name || 'Member'}</td>
                    <td>
                      {member.payment_completed ? 'Completed' : 'Pending'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted tiny">No customers in this rank yet.</p>
        )}
      </details>
    );
  })}
</section> 
      <article className="stat"><small>Verified commissions</small><strong>{money(totalCommission)}</strong></article><article className="stat"><small>My orders</small><strong>{orders.length}</strong></article><article className="stat"><small>Current rank</small><strong className="ranktext">{profile?.rank || 'Not Activated'}</strong></article></div>
     
<section className="panel">
  <p className="eyebrow">MY WALLETS</p>
  <h2>Wallet balances</h2>

  <div className="stats">
    <article className="stat">
      <small>Main Wallet · Withdrawable</small>
      <strong>{money(mainWalletAvailable / 100)}</strong>
    </article>

    <article className="stat">
      <small>Rank Upgrade Credit · Not withdrawable</small>
      <strong>{money(rankUpgradeCredits / 100)}</strong>
    </article>
  </div>

  <p className="tiny muted">
    Pending and approved withdrawals are reserved from your Main Wallet.
    Rank Upgrade Credit cannot be withdrawn.
  </p>
</section>

<section className="panel">
  <p className="eyebrow">PAYOUT</p>
  <h2>Request withdrawal</h2>

  <form onSubmit={submitWithdrawal}>
    <label>
      Amount (₹)
      <input
        type="number"
        min="1"
        step="0.01"
        required
        value={withdrawAmount}
        onChange={e => setWithdrawAmount(e.target.value)}
        placeholder="Enter amount"
      />
    </label>

    <label>
      Payout method
      <select
        value={payoutMethod}
        onChange={e => setPayoutMethod(e.target.value)}
      >
        <option value="upi">UPI</option>
        <option value="bank">Bank transfer</option>
      </select>
    </label>

    {payoutMethod === 'upi' ? (
      <label>
        UPI ID
        <input
          required
          value={upiId}
          onChange={e => setUpiId(e.target.value)}
          placeholder="example@upi"
        />
      </label>
    ) : (
      <>
        <label>
          Account holder name
          <input
            required
            value={accountHolder}
            onChange={e => setAccountHolder(e.target.value)}
          />
        </label>

        <label>
          Account number
          <input
            required
            value={accountNumber}
            onChange={e => setAccountNumber(e.target.value)}
          />
        </label>

        <label>
          IFSC code
          <input
            required
            value={ifsc}
            onChange={e => setIfsc(e.target.value)}
            placeholder="Example: SBIN0001234"
          />
        </label>
      </>
    )}

    <button
      className="primary"
      type="submit"
      disabled={busy || mainWalletAvailable <= 0}
    >
      {busy ? 'Please wait…' : 'Submit withdrawal request'}
    </button>
  </form>
</section>

<section className="panel">
  <h2>My withdrawal history</h2>

  <div className="tablewrap">
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Amount</th>
          <th>Method</th>
          <th>Status</th>
          <th>Admin note</th>
        </tr>
      </thead>
      <tbody>
        {withdrawals.length ? withdrawals.map(w => (
          <tr key={w.id}>
            <td>{new Date(w.created_at).toLocaleDateString('en-IN')}</td>
            <td>{money(Number(w.amount_paise) / 100)}</td>
            <td>{w.payout_method.toUpperCase()}</td>
            <td>{w.status.toUpperCase()}</td>
            <td>{w.admin_note || '—'}</td>
          </tr>
        )) : (
          <tr>
            <td colSpan="5" className="muted">No withdrawal requests yet.</td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
</section>

      <section className="panel">
  <div className="sectionhead">
    <div>
      <p className="eyebrow">DIGITAL PRODUCT</p>
      <h2>SUCCESS SKILL eBook</h2>
    </div>
    <span className="price">₹600</span>
  </div>

  <p className="muted">
    Learn, apply and grow with the SUCCESS SKILL digital learning program.
  </p>

  <div className="actions">
  {!hideBuyButton ? (
    <button
      className="primary"
      onClick={placeOrder}
      disabled={busy}
    >
      Buy eBook · ₹600
    </button>
  ) : (
    <div className="notice">
      {isPlatinumOrHigher
        ? '✓ eBook purchased. Your membership is activated.'
        : 'Payment verified. Your rank activation is being processed.'}
    </div>
  )}

  <button
    className="outline dark"
    onClick={downloadBook}
    disabled={busy}
  >
    Download purchased eBook
  </button>
</div>
</section>
      <section className="panel"><h2>Rank pathway</h2><div className="rankpath">{ranks.map((r,i)=><div className={'rankstep '+(r===profile?.rank?'current':'')} key={r}><span>{String(i+1).padStart(2,'0')}</span><b>{r}</b></div>)}</div><p className="tiny muted">Ranks must be assigned using approved, documented genuine retail-sales criteria. Recruitment counts and paid rank upgrades are not used.</p></section>
      <section className="panel"><h2>My orders</h2><div className="tablewrap"><table><thead><tr><th>Date</th><th>Amount</th><th>Status</th><th>Retail verified</th></tr></thead><tbody>{orders.length?orders.map(o=><tr key={o.id}><td>{new Date(o.created_at).toLocaleDateString('en-IN')}</td><td>{money(Number(o.amount_paise || 0) / 100)}</td><td><span className={'status '+o.status}>{o.status}</span></td><td>{o.retail_verified?'Yes':'Pending'}</td></tr>):<tr><td colSpan="4" className="muted">No orders yet.</td></tr>}</tbody></table></div></section>
      <section className="panel"><h2>Commission history</h2><p className="tiny muted">Commissions are calculated only on administrator-verified qualifying retail sales under a legally reviewed plan.</p><div className="tablewrap"><table><thead><tr><th>Date</th><th>Amount</th><th>Status</th></tr></thead><tbody>{commissions.length?commissions.map(c=><tr key={c.id}><td>{new Date(c.created_at).toLocaleDateString('en-IN')}</td><td>{money(Number(c.commission_paise || 0) / 100)}</td>
<td>{c.payout_destination}</td></tr>):<tr><td colSpan="3" className="muted">No commissions recorded.</td></tr>}</tbody></table></div></section>
      {profile?.role==='admin'&&<><p className="eyebrow">ADMIN CONTROL</p>
  <h2>Withdrawal management</h2>

  <div className="tablewrap">
    <table>
      <thead>
        <tr>
          <th>Member</th>
          <th>Amount</th>
          <th>Method / Details</th>
          <th>Status</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        {adminWithdrawals.length ? adminWithdrawals.map(w => (
          <tr key={w.id}>
            <td>{w.member_id.slice(0, 8)}</td>
            <td>{money(Number(w.amount_paise) / 100)}</td>
            <td>
              {w.payout_method === 'upi' ? (
                <div>UPI: {w.payout_details?.upi_id}</div>
              ) : (
                <div>
                  <div>{w.payout_details?.account_holder}</div>
                  <div>Account: {w.payout_details?.account_number}</div>
                  <div>IFSC: {w.payout_details?.ifsc}</div>
                </div>
              )}
            </td><td>{w.status.toUpperCase()}</td>
            <td>
              {w.status === 'pending' && (
                <div className="actions">
                  <button
                    className="mini"
                    disabled={busy}
                    onClick={() => reviewWithdrawal(w.id, 'approved')}
                  >
                    Approve
                  </button>
                  <button
                    className="mini danger"
                    disabled={busy}
                    onClick={() => reviewWithdrawal(w.id, 'rejected')}
                  >
                    Reject
                  </button>
                </div>
              )}

              {w.status === 'approved' && (
                <div>
                  <input
                    placeholder="Enter UTR / reference"
                    value={payoutReferences[w.id] || ''}
                    onChange={e => setPayoutReferences(previous => ({
                      ...previous,
                      [w.id]: e.target.value
                    }))}
                  />
                  <button
                    className="mini"
                    disabled={busy}
                    onClick={() => completeWithdrawal(w.id)}
                  >
                    Mark as paid
                  </button>
                </div>
              )}

              {w.status === 'paid' && (
                <span>Payment completed</span>
              )}

              {w.status === 'rejected' && (
                <span>Request rejected</span>
              )}
            </td>
          </tr>
        )) : (
          <tr>
            <td colSpan="5" className="muted">
              No withdrawal requests.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
</section><p className="eyebrow">ADMIN CONTROL</p><h2>Order verification</h2><p className="tiny muted">Check payment proof and confirm that each order is a genuine retail sale before approving it.</p><div className="tablewrap"><table><thead><tr><th>Order</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody>{adminOrders.length?adminOrders.map(o=><tr key={o.id}><td>{o.profiles?.full_name||o.buyer_id.slice(0,8)}</td><td>{money(o.amount)}</td><td>{o.status}</td><td><div className="actions"><button className="mini" disabled={busy||o.status==='paid'} onClick={()=>updateOrder(o.id,'paid',true)}>Verify retail sale</button><button className="mini danger" disabled={busy||o.status==='rejected'} onClick={()=>updateOrder(o.id,'rejected',false)}>Reject</button></div></td></tr>):<tr><td colSpan="4" className="muted">No orders.</td></tr>}</tbody></table></div></section></>}
    </>}
    <section className="legal"><b>Important:</b> SUCCESS SKILL must sell a genuine eBook at a fair, disclosed price. Referral rewards, if offered, must be tied to verified retail sales and a compensation plan reviewed for compliance with Indian law. No payment is made merely for recruitment, joining, or upgrading a rank.</section>
    <footer>© {new Date().getFullYear()} SUCCESS SKILL · Built for learning and genuine product sales</footer>
  </main>;
}
