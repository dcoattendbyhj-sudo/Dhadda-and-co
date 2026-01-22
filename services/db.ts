
import { createClient } from '@supabase/supabase-js';

// Use Environment Variables for production deployment
// Fallback to current values for immediate connectivity
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://xbvvgvzreadiultzdigq.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_L0j1qxgCfX_p1Pp9dWM3bQ_Ako2DOji';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const db = {
  // Generic Fetcher
  getAll: async <T>(table: string): Promise<T[]> => {
    const { data, error } = await supabase.from(table).select('*');
    if (error) throw error;
    return data || [];
  },

  getFiltered: async <T>(table: string, column: string, value: any): Promise<T[]> => {
    const { data, error } = await supabase.from(table).select('*').eq(column, value);
    if (error) throw error;
    return data || [];
  },

  getSingle: async <T>(table: string, id: string): Promise<T | null> => {
    const { data, error } = await supabase.from(table).select('*').eq('id', id).single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  upsert: async <T>(table: string, data: any): Promise<void> => {
    // Clean data: remove undefined fields
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, v]) => v !== undefined && v !== null)
    );
    
    const { error } = await supabase.from(table).upsert(cleanData);
    if (error) {
      console.error(`DB Upsert Failure [${table}]:`, error);
      throw new Error(`Cloud rejection: ${error.message} (Code: ${error.code})`);
    }
  },

  delete: async (table: string, id: string): Promise<void> => {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) throw error;
  },

  initialize: async () => {
    console.log("AttendPro: Synchronizing with Cloud Infrastructure...");
    
    try {
      // Check for essential configuration table
      const { data: config, error: configError } = await supabase
        .from('system_config')
        .select('*')
        .eq('id', 'global')
        .single();
      
      if (configError) {
        // Table not found or connection issue
        if (configError.code === '42P01') {
          throw new Error("Missing Database Schema. Please execute the SQL script in your Supabase SQL Editor.");
        }
        if (configError.code !== 'PGRST116') {
          throw new Error(`Cloud Sync Error: ${configError.message}`);
        }
      }

      if (!config) {
        console.log("Initializing Global Operational Parameters...");
        const { error: setupError } = await supabase.from('system_config').insert({
          id: 'global',
          config: {
            officialClockInTime: '09:00',
            officialClockOutTime: '18:00',
            companyName: 'AttendPro Enterprise'
          }
        });
        if (setupError) console.warn("Initial setup warning:", setupError.message);
      }
      
      console.log("AttendPro: Secure Link Verified.");
    } catch (err: any) {
      console.error("Initialization Failed:", err.message);
      throw err;
    }
  }
};
