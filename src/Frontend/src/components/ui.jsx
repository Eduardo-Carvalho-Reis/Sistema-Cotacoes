import { useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowDownToLine, ArrowLeft, ArrowRight, BadgeCheck, Bell, Boxes, Building2,
  Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, ClipboardList, Clock3,
  FileCheck2, FileText, Gauge, HardHat, LayoutDashboard, LogOut, Menu, MessageCircle,
  Package, Plus, Search, Send, Settings2, ShoppingCart, SlidersHorizontal, Truck,
  Users, WalletCards, X,
} from 'lucide-react';

import { statusNames, statusClass } from '../utils/formatters.js';

function PageTitle({ eyebrow, title, description, action }) { return <div className="page-title-row"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>; }

function Button({ children, variant = 'primary', ...props }) { return <button className={`button ${variant}`} {...props}>{children}</button>; }

function Badge({ value }) { return <span className={`badge ${statusClass(value)}`}><i></i>{statusNames[value] || value || '—'}</span>; }

function Empty({ icon: Icon = ClipboardList, title, body, action }) { return <div className="empty-state"><div className="empty-icon"><Icon size={22}/></div><b>{title}</b><p>{body}</p>{action}</div>; }

function Stat({ icon: Icon, label, value, detail, tint }) { return <div className="stat-card"><div className={`stat-icon ${tint}`}><Icon size={18}/></div><span>{label}</span><div className="stat-value">{value}</div><small>{detail}</small></div>; }

export { PageTitle, Button, Badge, Empty, Stat };
