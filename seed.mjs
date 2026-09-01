import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://ovlhjnwwyvkclbaykpmp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bGhqbnd3eXZrY2xiYXlrcG1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5OTUyODMsImV4cCI6MjEwMjU3MTI4M30.E_tRMi97O2mXY7DCdDMG7chl5dSYCVC_tgTE_MFcXqw";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const nombres = ["Carlos Pérez", "Luis Gómez", "Miguel Torres", "Juan Mamani", "Diego Rojas", "Mateo Quispe", "Leo Silva", "André Vargas", "Thiago Mendoza", "Hugo Castillo"];
const sedes = ["El Bosque", "Las Torrecitas", "Víctor Raúl"];
const horarios = ["LMV", "MJS"];
const turnos = ["mañana", "tarde"];

async function seed() {
    console.log("Iniciando inyección de datos de prueba...");

    // 1. Insertar Estudiantes
    for (let i = 0; i < 10; i++) {
        // Estudiantes intercalan entre vigentes y vencidos
        const hoy = new Date();
        const valid_until = new Date(hoy);
        if (i % 3 === 0) valid_until.setDate(hoy.getDate() - 5); // Vencido hace 5 días
        else valid_until.setDate(hoy.getDate() + 20); // Vigente

        const { data: student, error: errSt } = await supabase.from('students').insert({
            full_name: nombres[i],
            dni: `7000${1000 + i}`,
            valid_until: valid_until.toISOString().split('T')[0],
            horario: horarios[i % 2],
            sede: sedes[i % 3],
            batido_credits: Math.floor(Math.random() * 5),
            is_active: true
        }).select().single();

        if (errSt) {
            console.error("Error estudiante:", errSt.message);
            continue;
        }

        console.log(`✅ Estudiante creado: ${student.full_name}`);

        // 2. Credencial (Kiosko / NFC)
        await supabase.from('credentials').insert({
            student_id: student.id,
            code: `NFC-${1000 + i}`
        });

        // 3. Biometría
        await supabase.from('biometria').insert({
            student_id: student.id,
            talla: (1.30 + (Math.random() * 0.3)).toFixed(2), // 1.30m - 1.60m
            peso: (30 + (Math.random() * 20)).toFixed(1), // 30kg - 50kg
            fecha: new Date().toISOString().split('T')[0]
        });

        // 4. Asistencia aleatoria
        await supabase.from('attendance').insert({
            student_id: student.id,
        });
    }

    // 5. Entrenadores
    await supabase.from('entrenadores').insert([
        { nombre: "Profe Jair", token: "MAGIC_TOKEN_JAIR" },
        { nombre: "Profe Luis", token: "MAGIC_TOKEN_LUIS" }
    ]);

    console.log("¡Inyección completada!");
}

seed();
