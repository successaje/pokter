import { WorkspaceFrame } from '@/shell/WorkspaceFrame';
import { Icon } from '@/ui/icons';

/*
 * Building: the work your agents do, laid out like Hiring. Every Build page
 * but the integration guide sits in it, so a direct link, a refresh or Back
 * lands inside the same section. Templates and the integration kit sit
 * below, as references rather than places work happens.
 */
export default function BuildingLayout({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceFrame
      section="building"
      items={[
        { href: '/build', label: 'Overview', icon: <Icon.Grid size={17} />, exact: true },
        { href: '/build/agents', label: 'My agents', icon: <Icon.Layers size={17} /> },
        { href: '/build/jobs', label: 'Jobs', icon: <Icon.Briefcase size={17} /> },
        { href: '/build/proposals', label: 'Proposals', icon: <Icon.Doc size={17} /> },
      ]}
      more={[
        { href: '/build/templates', label: 'Templates', icon: <Icon.Spark size={17} /> },
        { href: '/build/integration', label: 'Integration kit', icon: <Icon.Plug size={17} /> },
      ]}
    >
      {children}
    </WorkspaceFrame>
  );
}
