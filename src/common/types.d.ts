export type ConnectionType = 'DHC' | 'DHE';

export type ConnectionAndSession<TConnection, TSession> = {
  cn: TConnection;
  session: TSession;
};
