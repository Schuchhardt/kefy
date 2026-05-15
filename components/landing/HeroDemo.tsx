'use client';

import { useState, useEffect } from 'react';
import { useTypewriter } from '@/hooks/useTypewriter';
import type { KefyCopy } from '@/lib/content';

interface HeroDemoProps {
  copy: KefyCopy['demo'];
}

const TABS = ['LinkedIn', 'Meta Ads', 'X'] as const;
type Tab = typeof TABS[number];

export default function HeroDemo({ copy }: HeroDemoProps) {
  const [activeTab, setActiveTab] = useState<Tab>('LinkedIn');
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setStarted(true), 600);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveTab((t) => {
        const idx = TABS.indexOf(t);
        return TABS[(idx + 1) % TABS.length];
      });
    }, 4200);
    return () => clearInterval(interval);
  }, []);

  const outputMap: Record<Tab, typeof copy.outputs.linkedin> = {
    LinkedIn: copy.outputs.linkedin,
    'Meta Ads': copy.outputs.meta,
    X: copy.outputs.x,
  };

  const currentOutput = outputMap[activeTab];

  const typeBody = useTypewriter(
    activeTab === 'LinkedIn' ? copy.outputs.linkedin.body : '',
    18,
    started && activeTab === 'LinkedIn'
  );

  const displayBody =
    activeTab === 'LinkedIn' ? typeBody : currentOutput.body;
  const showCursor = activeTab === 'LinkedIn' && typeBody.length < copy.outputs.linkedin.body.length;

  return (
    <div className="demo reveal is-in">
      {/* Browser bar */}
      <div className="demo-bar">
        <div className="demo-dots">
          <span />
          <span />
          <span />
        </div>
        <div className="demo-url">
          <span className="acc">app</span>.kefy.io /&nbsp;
          <span>dashboard</span>
        </div>
      </div>

      <div className="demo-grid">
        {/* Left panel */}
        <div className="demo-left">
          {/* Brand context */}
          <div className="demo-section">
            <div className="demo-section-lbl">{copy.contextLbl}</div>
            <div className="demo-context">
              <span className="product">{copy.contextProduct}</span>
              <span className="cursor" />
              <br />
              <span style={{ color: 'var(--muted)', fontSize: '12px' }}>
                {copy.contextDesc}
              </span>
            </div>
          </div>

          {/* Channel tabs */}
          <div className="demo-section">
            <div className="demo-section-lbl">{copy.channelsLbl}</div>
            <div className="demo-tabs">
              {TABS.map((tab) => (
                <button
                  key={tab}
                  className={`demo-tab${activeTab === tab ? ' active' : ''}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* Meta */}
          <div className="demo-meta">
            <div className="demo-meta-item">
              <div className="k">{copy.goalK}</div>
              <div className="v" style={{ color: 'var(--accent)' }}>
                {copy.goalV}
              </div>
            </div>
            <div className="demo-meta-item">
              <div className="k">{copy.audienceK}</div>
              <div className="v">{copy.audienceV}</div>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="demo-right">
          <div className="demo-output">
            <div className="demo-output-head">
              <div className="demo-output-channel">
                <div className="ic">
                  {activeTab === 'LinkedIn' && 'in'}
                  {activeTab === 'Meta Ads' && '◆'}
                  {activeTab === 'X' && '𝕏'}
                </div>
                {currentOutput.channel}
              </div>
              <div className="demo-output-meta">{currentOutput.meta}</div>
            </div>

            {activeTab === 'Meta Ads' ? (
              <>
                <div className="demo-typewriter" style={{ whiteSpace: 'pre-wrap' }}>
                  {currentOutput.body}
                </div>
                <div className="demo-output-visual">
                  <div className="demo-img warm">
                    <div className="demo-img-shape" />
                    <div className="demo-img-label">variant_01</div>
                  </div>
                  <div className="demo-img lime">
                    <div className="demo-img-shape" />
                    <div className="demo-img-label">variant_02</div>
                  </div>
                </div>
              </>
            ) : (
              <div className="demo-typewriter">
                {displayBody}
                {showCursor && <span className="blink" />}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
