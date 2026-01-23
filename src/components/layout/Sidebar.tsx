import React, { useEffect, useLayoutEffect, useState, useRef, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Clock,
  Calendar,
  CheckSquare,
  ClipboardList,
  FileText,
  Users,
  Upload,
  Award,
  Phone,
  ChevronDown,
  ChevronRight,
  User,
  BarChart3,
  Shield,
  Menu,
  LogOut,
  Settings,
  DollarSign,
  Megaphone,
  Building2,
  Sparkles,
  MessageSquare,
  Brain,
  ShieldAlert,
  Library,
  Cpu,
  PieChart,
} from 'lucide-react';
import { useUserRoles } from '@/hooks/useUserRoles';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { NotificationsDropdown } from '@/components/notifications/NotificationsDropdown';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  badge?: string | number;
}

interface NavGroup {
  title: string;
  icon: React.ElementType;
  items: NavItem[];
  defaultOpen?: boolean;
}

// Sidebar content component (shared between desktop and mobile)
const SidebarContent: React.FC<{
  onNavigate?: () => void;
}> = ({ onNavigate }) => {
  const location = useLocation();
  const { canManageUsers, canManageAllTimeEntries, userRoles } = useUserRoles();
  const { signOut } = useAuth();
  const { profile } = useProfile();

  // Persist sidebar group state in localStorage
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('sidebar-groups');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      'my-stuff': true,
      'time-management': true,
      'call-quality': false,
      'reports': false,
      'admin': false,
    };
  });

  const toggleGroup = (groupId: string) => {
    setOpenGroups(prev => {
      const next = { ...prev, [groupId]: !prev[groupId] };
      localStorage.setItem('sidebar-groups', JSON.stringify(next));
      return next;
    });
  };

  // Preserve scroll position across navigation
  const navRef = useRef<HTMLElement>(null);
  const scrollPositionRef = useRef<number>(0);

  // Save scroll position on every scroll
  const handleScroll = useCallback(() => {
    if (navRef.current) {
      scrollPositionRef.current = navRef.current.scrollTop;
      sessionStorage.setItem('sidebar-scroll', String(navRef.current.scrollTop));
    }
  }, []);

  // Restore scroll position synchronously before paint
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    // Restore from session storage or ref
    const savedScroll = sessionStorage.getItem('sidebar-scroll');
    if (savedScroll) {
      const scrollTop = parseInt(savedScroll, 10);
      // Restore immediately
      nav.scrollTop = scrollTop;
      scrollPositionRef.current = scrollTop;

      // Also restore after a brief delay to handle any layout shifts
      requestAnimationFrame(() => {
        if (nav) {
          nav.scrollTop = scrollTop;
        }
      });
    }
  }, [location.pathname]); // Re-run on route change

  // Set up scroll listener
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    nav.addEventListener('scroll', handleScroll, { passive: true });
    return () => nav.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const getEmployeeName = () => {
    if (profile?.first_name || profile?.last_name) {
      return `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim();
    }
    return profile?.email?.split('@')[0] || 'User';
  };

  const getPrimaryRole = () => {
    if (userRoles.length === 0) return null;
    if (userRoles.includes('admin')) return 'Admin';
    if (userRoles.includes('manager')) return 'Manager';
    if (userRoles.includes('ccm')) return 'CCM';
    if (userRoles.includes('crm')) return 'CRM';
    return userRoles[0];
  };

  // Navigation structure
  const myStuffItems: NavItem[] = [
    { href: '/profile', label: 'My Profile', icon: User },
    { href: '/report-cards', label: 'My Report Cards', icon: Award },
  ];

  const timeManagementItems: NavItem[] = [
    { href: '/shift-scheduler', label: 'Shift Scheduler', icon: Calendar },
    { href: '/shift-report', label: 'Shift Report', icon: Clock },
    { href: '/time-off-approvals', label: 'Time Off Approvals', icon: CheckSquare },
    { href: '/time-correction-approvals', label: 'Time Corrections', icon: ClipboardList },
  ];

  // Consolidated Call Quality navigation
  // Removed redundant items:
  // - /admin-reports (merged into /performance)
  // - /compliance-alerts (merged into /conversation-intelligence as a tab)
  // - /call-library (commented out - functionality covered by analytics + call-import)
  const callQualityItems: NavItem[] = [
    { href: '/performance', label: 'Performance Hub', icon: Sparkles },
    { href: '/conversation-intelligence', label: 'Conversation AI', icon: Brain },
    // { href: '/call-library', label: 'Call Library', icon: Library }, // Disabled - use Analytics for browsing
    { href: '/call-import', label: 'Import Calls', icon: Upload },
    { href: '/coaching', label: 'Agent Coaching', icon: MessageSquare },
    { href: '/audit-templates', label: 'Audit Templates', icon: Settings },
    { href: '/ai-settings', label: 'AI Settings', icon: Cpu },
  ];

  const reportsItems: NavItem[] = [
    { href: '/analytics', label: 'Analytics Dashboards', icon: PieChart },
    { href: '/payroll', label: 'Payroll Export', icon: DollarSign },
    { href: '/time-off-report', label: 'Time Off Report', icon: FileText },
    { href: '/uto-report', label: 'UTO Report', icon: FileText },
  ];

  const adminItems: NavItem[] = [
    { href: '/admin', label: 'User Management', icon: Users },
    { href: '/announcements', label: 'Announcements', icon: Megaphone },
    { href: '/settings', label: 'Company Settings', icon: Building2 },
  ];

  const navGroups: NavGroup[] = [
    ...(true ? [{
      title: 'My Stuff',
      icon: User,
      items: myStuffItems,
      defaultOpen: true
    }] : []),
    ...(canManageAllTimeEntries() ? [{
      title: 'Time Management',
      icon: Clock,
      items: timeManagementItems,
      defaultOpen: true
    }] : []),
    ...(canManageUsers() ? [{
      title: 'Call Quality',
      icon: Phone,
      items: callQualityItems,
      defaultOpen: false
    }] : []),
    ...(canManageUsers() ? [{
      title: 'Reports',
      icon: BarChart3,
      items: reportsItems,
      defaultOpen: false
    }] : []),
    ...(canManageUsers() ? [{
      title: 'Admin',
      icon: Shield,
      items: adminItems,
      defaultOpen: false
    }] : []),
  ];

  const isActive = (href: string) => location.pathname === href;

  const NavLink: React.FC<{ item: NavItem }> = ({ item }) => {
    const Icon = item.icon;
    const active = isActive(item.href);

    return (
      <Link
        to={item.href}
        onClick={(e) => {
          e.stopPropagation();
          onNavigate?.();
        }}
        className={cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200',
          active
            ? 'bg-[var(--color-accent)] text-white font-medium'
            : 'text-[var(--color-subtext)] hover:bg-[var(--color-border)] hover:text-[var(--color-text)]'
        )}
      >
        <Icon
          className={cn(
            "h-4 w-4 flex-shrink-0",
            active ? "text-white" : "text-[var(--color-subtext)]"
          )}
        />

        <span
          className={cn(
            "truncate",
            active ? "text-white" : "text-[var(--color-subtext)]"
          )}
        >
          {item.label}
        </span>
        {item.badge && (
          <Badge variant="secondary" className="ml-auto text-xs">
            {item.badge}
          </Badge>
        )}
      </Link>
    );
  };

  const NavGroupComponent: React.FC<{ group: NavGroup; groupId: string }> = ({ group, groupId }) => {
    const Icon = group.icon;
    const isOpen = openGroups[groupId] ?? group.defaultOpen;
    const hasActiveChild = group.items.some(item => isActive(item.href));

    return (
      <Collapsible open={isOpen} onOpenChange={() => toggleGroup(groupId)}>
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-border)] transition-colors">
          <div className="flex items-center gap-3">
            <Icon className={cn(
              "h-4 w-4",
              hasActiveChild && "text-[var(--color-accent)]"
            )} />
            <span
              className={cn(
                hasActiveChild ? "!text-[var(--color-accent)]" : "!text-[var(--color-text)]"
              )}
            >
              {group.title}
            </span>
          </div>
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-[var(--color-subtext)]" />
          ) : (
            <ChevronRight className="h-4 w-4 text-[var(--color-subtext)]" />
          )}
        </CollapsibleTrigger>
        <CollapsibleContent className="pl-4 pt-1 space-y-1">
          {group.items.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Logo Section */}
      <div className="p-6 pb-4">
        <div className="flex flex-col items-center">
          <img
            src="/cliopa.png"
            alt="Cliopa.io"
            className="w-16 h-16 object-contain mb-2"
          />
          <h2 className="text-xl font-bold text-[var(--color-text)] tracking-tight">
            Cliopa.io
          </h2>
          <p className="text-xs text-[var(--color-subtext)] mt-0.5">
            AI-Powered Workforce
          </p>
        </div>
      </div>

      <Separator className="bg-[var(--color-border)]" />

      {/* User Profile Quick View */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-3 p-2 rounded-lg bg-[var(--color-bg)]">
          <div className="w-9 h-9 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-white font-medium text-sm">
            {getEmployeeName().charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[var(--color-text)] truncate">
              {getEmployeeName()}
            </p>
            {getPrimaryRole() && (
              <p className="text-xs text-[var(--color-subtext)]">
                {getPrimaryRole()}
              </p>
            )}
          </div>
          <NotificationsDropdown />
        </div>
      </div>

      <Separator className="bg-[var(--color-border)]" />

      {/* Main Navigation */}
      <nav ref={navRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-1 scroll-smooth">
        {/* Dashboard - Always visible */}
        <Link
          to="/dashboard"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate?.();
          }}
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
            isActive('/dashboard') || isActive('/')
              ? 'bg-[var(--color-accent)] text-white'
              : 'text-[var(--color-text)] hover:bg-[var(--color-border)]'
          )}
        >
          <LayoutDashboard
            className={cn(
              "h-5 w-5",
              isActive("/dashboard") || isActive("/") ? "text-white" : "text-[var(--color-text)]"
            )}
          />
          <span
            className={cn(
              isActive("/dashboard") || isActive("/")
                ? "text-white"
                : "text-[var(--color-text)]"
            )}
          >
            Dashboard
          </span>
        </Link>

        <div className="pt-2 space-y-2">
          {navGroups.map((group) => (
            <NavGroupComponent
              key={group.title}
              group={group}
              groupId={group.title.toLowerCase().replace(/\s+/g, '-')}
            />
          ))}
        </div>
      </nav>

      {/* Bottom Section */}
      <div className="mt-auto border-t border-[var(--color-border)] p-4 space-y-3">
        {/* Sign Out Button */}
        <Button
          variant="ghost"
          onClick={handleSignOut}
          className="w-full justify-center gap-2 text-[var(--color-subtext)] hover:text-[var(--color-danger)] hover:bg-red-50"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign Out</span>
        </Button>

        {/* Footer */}
        <p className="text-xs text-[var(--color-subtext)] text-center pt-2">
          © {new Date().getFullYear()} Cliopa.io
        </p>
      </div>
    </div>
  );
};

// Mobile Header with Hamburger
export const MobileHeader: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { profile } = useProfile();

  const getEmployeeName = () => {
    if (profile?.first_name || profile?.last_name) {
      return `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim();
    }
    return profile?.email?.split('@')[0] || 'User';
  };

  return (
    <header className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-[var(--color-surface)] border-b border-[var(--color-border)] px-4 py-3">
      <div className="flex items-center justify-between">
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="text-[var(--color-text)]">
              <Menu className="h-6 w-6" />
              <span className="sr-only">Toggle menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0 bg-[var(--color-surface)]">
            <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
            <SidebarContent onNavigate={() => setIsOpen(false)} />
          </SheetContent>
        </Sheet>

        <div className="flex items-center gap-2">
          <img src="/cliopa.png" alt="Cliopa" className="w-8 h-8" />
          <span className="font-semibold text-[var(--color-text)]">Cliopa.io</span>
        </div>

        <div className="flex items-center gap-2">
          <NotificationsDropdown />
          <div className="w-8 h-8 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-white text-sm font-medium">
            {getEmployeeName().charAt(0).toUpperCase()}
          </div>
        </div>
      </div>
    </header>
  );
};

// Desktop Sidebar
export const Sidebar: React.FC = () => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 border-r border-[var(--color-border)] bg-[var(--color-surface)] flex-col h-screen sticky top-0">
        <SidebarContent />
      </aside>

      {/* Mobile Header */}
      <MobileHeader />
    </>
  );
};
