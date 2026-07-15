import React, { useState, useEffect, useCallback } from 'react';
import { Bell, X, Check, AlertTriangle, TrendingUp, TrendingDown, Settings, Trash2 } from 'lucide-react';

const NOTIF_TYPES = {
  signal: { icon: TrendingUp, color: '#2196F3', label: 'Signal' },
  buy: { icon: TrendingUp, color: '#00C853', label: 'Buy' },
  sell: { icon: TrendingDown, color: '#FF1744', label: 'Sell' },
  alert: { icon: AlertTriangle, color: '#FF9800', label: 'Alert' },
  fill: { icon: Check, color: '#4CAF50', label: 'Fill' },
  error: { icon: AlertTriangle, color: '#F44336', label: 'Error' },
  system: { icon: Bell, color: '#9C27B0', label: 'System' },
};

export default function NotificationsHub({ ws, maxNotifications = 100 }) {
  const [notifications, setNotifications] = useState([]);
  const [filter, setFilter] = useState('all');
  const [settings, setSettings] = useState({
    signal: true,
    buy: true,
    sell: true,
    alert: true,
    fill: false,
    error: true,
    system: true,
    soundEnabled: true,
    desktopEnabled: false,
  });
  const [showSettings, setShowSettings] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(0);

  useEffect(() => {
    if (!ws) return;
    const handler = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'signal' || msg.type === 'fill' || msg.type === 'error' || msg.type === 'alert') {
          const notifType = msg.data?.signal_type || msg.type;
          if (!settings[notifType]) return;

          const notification = {
            id: Date.now() + Math.random(),
            type: notifType,
            title: getNotifTitle(msg),
            message: getNotifMessage(msg),
            timestamp: Date.now(),
            read: false,
            data: msg.data,
          };

          setNotifications(prev => [notification, ...prev].slice(0, maxNotifications));
          setUnreadOnly(prev => prev + 1);

          if (settings.soundEnabled) playSound();
          if (settings.desktopEnabled) showDesktopNotification(notification);
        }
      } catch { /* ignore */ }
    };

    ws.addEventListener('message', handler);
    return () => ws.removeEventListener('message', handler);
  }, [ws, settings, maxNotifications]);

  const markAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadOnly(0);
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
    setUnreadOnly(0);
  }, []);

  const dismiss = useCallback((id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const filtered = filter === 'all' ? notifications : notifications.filter(n => n.type === filter);

  return (
    <div className="notifications-hub">
      <div className="nh-header">
        <div className="nh-title">
          <Bell size={20} />
          <span>Notifications</span>
          {unreadOnly > 0 && <span className="nh-badge">{unreadOnly}</span>}
        </div>
        <div className="nh-controls">
          <button onClick={() => setShowSettings(!showSettings)} className="nh-btn" title="Settings">
            <Settings size={16} />
          </button>
          <button onClick={markAllRead} className="nh-btn" title="Mark all read">
            <Check size={16} />
          </button>
          <button onClick={clearAll} className="nh-btn" title="Clear all">
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="nh-settings">
          <h4>Notification Settings</h4>
          {Object.entries(NOTIF_TYPES).map(([key, { label }]) => (
            <label key={key} className="nh-setting-row">
              <span>{label}</span>
              <input
                type="checkbox"
                checked={settings[key] || false}
                onChange={(e) => setSettings({ ...settings, [key]: e.target.checked })}
              />
            </label>
          ))}
          <label className="nh-setting-row">
            <span>Sound</span>
            <input
              type="checkbox"
              checked={settings.soundEnabled}
              onChange={(e) => setSettings({ ...settings, soundEnabled: e.target.checked })}
            />
          </label>
          <label className="nh-setting-row">
            <span>Desktop notifications</span>
            <input
              type="checkbox"
              checked={settings.desktopEnabled}
              onChange={(e) => {
                if (e.target.checked && Notification?.permission === 'default') {
                  Notification.requestPermission();
                }
                setSettings({ ...settings, desktopEnabled: e.target.checked });
              }}
            />
          </label>
        </div>
      )}

      <div className="nh-filters">
        <button
          className={`nh-filter-btn ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >All</button>
        {Object.entries(NOTIF_TYPES).map(([key, { label, color }]) => (
          <button
            key={key}
            className={`nh-filter-btn ${filter === key ? 'active' : ''}`}
            onClick={() => setFilter(key)}
            style={filter === key ? { borderColor: color } : {}}
          >{label}</button>
        ))}
      </div>

      <div className="nh-list">
        {filtered.length === 0 ? (
          <div className="nh-empty">No notifications</div>
        ) : (
          filtered.map(n => {
            const config = NOTIF_TYPES[n.type] || NOTIF_TYPES.system;
            const Icon = config.icon;
            return (
              <div key={n.id} className={`nh-item ${n.read ? '' : 'unread'}`}>
                <div className="nh-item-icon" style={{ color: config.color }}>
                  <Icon size={18} />
                </div>
                <div className="nh-item-content">
                  <div className="nh-item-title">{n.title}</div>
                  <div className="nh-item-message">{n.message}</div>
                  <div className="nh-item-time">{formatTime(n.timestamp)}</div>
                </div>
                <button onClick={() => dismiss(n.id)} className="nh-item-dismiss">
                  <X size={14} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function getNotifTitle(msg) {
  if (msg.type === 'signal') return `${msg.data?.signal_type?.toUpperCase() || 'Signal'} — ${msg.data?.symbol || ''}`;
  if (msg.type === 'fill') return `Fill — ${msg.data?.symbol || ''}`;
  if (msg.type === 'error') return 'Error';
  if (msg.type === 'alert') return `Alert — ${msg.data?.symbol || ''}`;
  return msg.type || 'Notification';
}

function getNotifMessage(msg) {
  if (msg.type === 'signal') {
    return `${msg.data?.strategy || ''} | confidence: ${((msg.data?.confidence || 0) * 100).toFixed(0)}% | $${msg.data?.price?.toFixed(2) || ''}`;
  }
  if (msg.type === 'fill') {
    return `${msg.data?.side || ''} ${msg.data?.qty || 0} @ $${msg.data?.price?.toFixed(2) || ''}`;
  }
  if (msg.type === 'error') return msg.data?.message || 'An error occurred';
  if (msg.type === 'alert') return msg.data?.message || msg.data?.reason || '';
  return JSON.stringify(msg.data || {});
}

function formatTime(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

function playSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800;
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch { /* ignore */ }
}

function showDesktopNotification(notif) {
  if (Notification?.permission === 'granted') {
    new Notification(notif.title, { body: notif.message });
  }
}
