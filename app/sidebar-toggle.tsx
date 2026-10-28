'use client';
import {useEffect, useState} from 'react';
import {PanelLeftClose, PanelLeftOpen} from 'lucide-react';

export function useSidebarPreference(scope: string) {
  const key = `noteflow-sidebar-${scope}`;
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try { setCollapsed(localStorage.getItem(key) === 'collapsed'); } catch { /* Storage is optional. */ }
  }, [key]);
  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(key, next ? 'collapsed' : 'expanded'); } catch { /* Keep the in-memory preference. */ }
  }
  return {collapsed, toggle};
}

export function SidebarToggle({collapsed, toggle, controls}: {collapsed: boolean; toggle: () => void; controls: string}) {
  const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
  return <button type="button" className="sidebar-toggle" aria-label={label} title={label} aria-expanded={!collapsed} aria-controls={controls} onClick={toggle}>
    {collapsed ? <PanelLeftOpen size={19} aria-hidden="true"/> : <PanelLeftClose size={19} aria-hidden="true"/>}
  </button>;
}
