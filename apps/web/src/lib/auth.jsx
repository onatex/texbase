import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import pb from '@/lib/pocketbaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(pb.authStore.record);

    useEffect(() => {
        const unsub = pb.authStore.onChange((_t, record) => setUser(record));
        return unsub;
    }, []);

    const value = useMemo(
        () => ({
            user,
            isAuthed: pb.authStore.isValid,
            esAdmin: user?.rol === 'admin',
            esProduccio: user?.rol === 'produccio',
            esQualitat: user?.rol === 'qualitat',
            esOperari: user?.rol === 'operari',
            rol: user?.rol || null,
            login: (identitat, password) =>
                pb.collection('users').authWithPassword(identitat, password),
            logout: () => pb.authStore.clear(),
        }),
        [user],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth fuera de AuthProvider');
    return ctx;
}
