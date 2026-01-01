export async function create(input) {
  const lead_id = crypto.randomUUID();
  return {
    result: { lead_id },
    effects: {
      db_writes: [
        { table: 'leads', action: 'insert', id: lead_id }
      ]
    }
  };
}
