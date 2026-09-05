import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Define SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en un .env local antes de ejecutar el seed.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
});

const nombres = ['Carlos Pérez', 'Luis Gómez', 'Miguel Torres', 'Juan Mamani', 'Diego Rojas', 'Mateo Quispe', 'Leo Silva', 'André Vargas', 'Thiago Mendoza', 'Hugo Castillo'];
const sedes = ['El Bosque', 'Las Torrecitas', 'Víctor Raúl'];
const horarios = ['LMV', 'MJS'];

async function seed() {
    console.log('Iniciando carga de datos de prueba...');

    for (let i = 0; i < nombres.length; i += 1) {
        const hoy = new Date();
        const validUntil = new Date(hoy);
        validUntil.setDate(hoy.getDate() + (i % 3 === 0 ? -5 : 20));

        const { data: student, error: studentError } = await supabase
            .from('students')
            .insert({
                full_name: nombres[i],
                dni: `7000${1000 + i}`,
                valid_until: validUntil.toISOString().split('T')[0],
                horario: horarios[i % horarios.length],
                sede: sedes[i % sedes.length],
                batido_credits: Math.floor(Math.random() * 5),
                is_active: true
            })
            .select()
            .single();

        if (studentError) {
            console.error(`No se pudo crear ${nombres[i]}:`, studentError.message);
            continue;
        }

        console.log(`Estudiante creado: ${student.full_name}`);

        await supabase.from('credentials').insert({
            student_id: student.id,
            code: `NFC-${1000 + i}`
        });

        await supabase.from('biometria').insert({
            student_id: student.id,
            talla: (1.3 + Math.random() * 0.3).toFixed(2),
            peso: (30 + Math.random() * 20).toFixed(1),
            fecha: new Date().toISOString().split('T')[0]
        });

        await supabase.from('attendance').insert({ student_id: student.id });
    }

    console.log('Carga de prueba completada.');
}

seed().catch(error => {
    console.error('El seed falló:', error);
    process.exitCode = 1;
});
