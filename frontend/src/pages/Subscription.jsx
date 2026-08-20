import React, { useEffect, useState } from 'react';
import { Col } from 'react-bootstrap';
import axios from 'axios';
import { Check, Sparkles, Zap, Crown } from 'lucide-react';
import PaymentButton from '../components/PaymentButton';
import styles from './Subscription.module.css';

// ✅ Placeholder feature lists — swap when product has final copy
const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    priceLabel: '₹0',
    period: 'forever',
    desc: 'Try the portal and explore limited dashboards.',
    accent: '#64748b',
    icon: Sparkles,
    features: [
      'Access to Home portal overview',
      'View locked dashboards (preview)',
      'Basic account settings',
      'No device / user management',
    ],
  },
  {
    id: 'standard',
    name: 'Standard',
    price: 99,
    priceLabel: '₹99',
    period: '/month',
    desc: 'Core monitoring for day-to-day operations.',
    accent: '#4db3b3',
    icon: Zap,
    popular: true,
    features: [
      'All enabled company dashboards',
      'Add & manage devices',
      'Add team users (company admin)',
      'Live KPIs and recent activity',
      'Email support',
    ],
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 199,
    priceLabel: '₹199',
    period: '/month',
    desc: 'Full unlock with priority help when you need it.',
    accent: '#0d7377',
    icon: Crown,
    features: [
      'Everything in Standard',
      'Priority support response',
      'Best for multi-dashboard fleets',
      'Early access to new modules',
      'Dedicated onboarding help',
    ],
  },
];

export default function Subscription() {
  const [isActive, setIsActive] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        // ❗ API returns { active: true/false } (sometimes also status)
        const res = await axios.get('/api/subscription/status', { withCredentials: true });
        const active =
          res.data?.active === true ||
          res.data?.status === 'active';
        setIsActive(Boolean(active));
      } catch (err) {
        console.error('Failed to fetch subscription status', err);
        setIsActive(false);
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
  }, []);

  return (
    <Col xs={12} md={9} lg={10} xl={10} className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>Billing</p>
          <h1 className={styles.title}>Choose your plan</h1>
          <p className={styles.subtitle}>
            Unlock dashboards, devices, and team tools. Upgrade or renew anytime —
            billing is handled securely via Razorpay.
          </p>
        </div>

        {!loading && (
          <span
            className={`${styles.statusChip} ${
              isActive ? styles.statusActive : styles.statusInactive
            }`}
          >
            <span className={styles.statusDot} aria-hidden />
            {isActive ? 'Subscription active' : 'Subscription inactive'}
          </span>
        )}
      </header>

      <div className={styles.grid}>
        {PLANS.map((plan) => {
          const Icon = plan.icon;
          const isFree = plan.price === 0;
          const mutedFree = isFree && isActive;

          return (
            <article
              key={plan.id}
              className={[
                styles.card,
                plan.popular ? styles.cardPopular : '',
                mutedFree ? styles.cardMuted : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ '--plan-accent': plan.accent }}
            >
              {plan.popular && <span className={styles.badge}>Most popular</span>}

              <div className={styles.iconWrap} aria-hidden>
                <Icon size={18} strokeWidth={2} />
              </div>

              <h2 className={styles.planName}>{plan.name}</h2>
              <p className={styles.planDesc}>{plan.desc}</p>

              <div className={styles.priceRow}>
                <span className={styles.price}>{plan.priceLabel}</span>
                <span className={styles.pricePeriod}>{plan.period}</span>
              </div>

              <ul className={styles.features}>
                {plan.features.map((item) => (
                  <li key={item} className={styles.feature}>
                    <Check size={15} className={styles.featureIcon} strokeWidth={2.4} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <div className={styles.ctaWrap}>
                {isFree ? (
                  <div className={styles.currentBtn}>
                    {isActive ? 'Included with trial access' : 'Your starting plan'}
                  </div>
                ) : isActive ? (
                  <PaymentButton
                    amount={plan.price}
                    label={
                      plan.id === 'premium'
                        ? 'Renew / switch to Premium'
                        : 'Renew Standard plan'
                    }
                  />
                ) : (
                  <PaymentButton amount={plan.price} />
                )}
              </div>
            </article>
          );
        })}
      </div>

      <p className={styles.note}>
        {isActive
          ? 'Your plan is active. Renew anytime before expiry to keep devices and user tools unlocked.'
          : 'Payments are processed by Razorpay. Access unlocks right after a successful payment.'}
      </p>
    </Col>
  );
}
