export interface Permissions {
    terminal: boolean;
    filesystem: boolean;
    tests: boolean;
}

export type PermissionProfile = 'safe' | 'dev' | 'fullauto';

const defaultPermissions: Record<PermissionProfile, Permissions> = {
    safe: {
        terminal: false,
        filesystem: true,
        tests: false
    },
    dev: {
        terminal: true,
        filesystem: true,
        tests: true
    },
    fullauto: {
        terminal: true,
        filesystem: true,
        tests: true
    }
};

class PermissionsManager {
    private permissions: Permissions = { ...defaultPermissions.dev };
    private profile: PermissionProfile = 'dev';

    allow(toolId: string): boolean {
        switch (toolId) {
            case 'terminal': return this.permissions.terminal;
            case 'filesystem': return this.permissions.filesystem;
            case 'tests': return this.permissions.tests;
            default: return false;
        }
    }

    setPermission(toolId: keyof Permissions, value: boolean): void {
        this.permissions[toolId] = value;
    }

    getPermissions(): Permissions {
        return { ...this.permissions };
    }

    setProfile(profile: PermissionProfile): void {
        this.profile = profile;
        this.permissions = { ...defaultPermissions[profile] };
    }

    getProfile(): PermissionProfile {
        return this.profile;
    }
}

export const permissionsManager = new PermissionsManager();
