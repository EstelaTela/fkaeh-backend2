const express = require('express');
const mysql   = require('mysql2/promise');
const multer  = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;

const app = express();
app.use(express.json());

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, ngrok-skip-browser-warning');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ── Cloudinary config ─────────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: 'dhqxoiuzl',
  api_key:    '619413824987658',
  api_secret: 'ZG1m3cYngKbmr5-tkfkqo1MxT58'
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'fkaeh-productos',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 800, height: 800, crop: 'limit' }]
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ── Config BD ─────────────────────────────────────────────────────────────────
const dbConfig = {
  host:     'mysql.railway.internal',
  port:     3306,
  user:     'root',
  password: 'siUsSgFYhkZEfiPYEBQIBLwuIuAKWFrF',
  database: 'railway'
};

// ============= LOGIN =============
app.post('/login', async (req, res) => {
  const { correo, contrasena } = req.body;
  if (!correo || !contrasena) return res.status(400).json({ error: 'Faltan campos' });
  let conn;
  try {
    conn = await mysql.createConnection(dbConfig);
    const [rows] = await conn.execute(
      `SELECT u.id_usuario, u.nombre, u.correo, u.id_rol, r.nombre_rol
       FROM Usuarios u JOIN Roles r ON u.id_rol = r.id_rol
       WHERE u.correo = ? AND u.contrasena = ?`,
      [correo, contrasena]
    );
    if (rows.length === 0) return res.status(401).json({ error: 'Credenciales incorrectas' });
    res.json({ usuario: rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  } finally { conn?.end(); }
});

// ============= REGISTRO =============
app.post('/registro', async (req, res) => {
  const { nombre, correo, contrasena, telefono } = req.body;
  if (!nombre || !correo || !contrasena) return res.status(400).json({ error: 'Faltan campos' });
  let conn;
  try {
    conn = await mysql.createConnection(dbConfig);
    const [existe] = await conn.execute('SELECT id_usuario FROM Usuarios WHERE correo = ?', [correo]);
    if (existe.length > 0) return res.status(409).json({ error: 'El correo ya está registrado' });
    const [result] = await conn.execute(
      'INSERT INTO Usuarios (nombre, correo, contrasena, telefono, id_rol) VALUES (?, ?, ?, ?, 2)',
      [nombre, correo, contrasena, telefono || null]
    );
    const [rows] = await conn.execute(
      `SELECT u.id_usuario, u.nombre, u.correo, u.id_rol, r.nombre_rol
       FROM Usuarios u JOIN Roles r ON u.id_rol = r.id_rol WHERE u.id_usuario = ?`,
      [result.insertId]
    );
    res.status(201).json({ usuario: rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  } finally { conn?.end(); }
});

// ============= GET PRODUCTOS =============
app.get('/productos', async (req, res) => {
  let conn;
  try {
    conn = await mysql.createConnection(dbConfig);
    const [rows] = await conn.execute(
      `SELECT p.id_producto, p.id_vendedor, p.id_categoria, p.nombre,
              p.descripcion, p.precio_base, p.estado_prenda, p.fecha_publicacion,
              (SELECT url_foto FROM Fotos_Producto
               WHERE id_producto = p.id_producto AND es_principal = TRUE
               LIMIT 1) AS foto_principal
       FROM Productos p
       ORDER BY p.fecha_publicacion DESC`
    );
    res.json({ productos: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  } finally { conn?.end(); }
});

// ============= CREAR PRODUCTO =============
app.post('/productos', async (req, res) => {
  const { id_vendedor, nombre, descripcion, precio_base, id_categoria, estado_prenda } = req.body;
  if (!id_vendedor || !nombre || !precio_base) return res.status(400).json({ error: 'Faltan campos obligatorios' });
  let conn;
  try {
    conn = await mysql.createConnection(dbConfig);
    let categoriaId = id_categoria;
    if (typeof id_categoria === 'string' && isNaN(id_categoria)) {
      const [cats] = await conn.execute('SELECT id_categoria FROM Categorias WHERE nombre = ?', [id_categoria]);
      if (cats.length > 0) {
        categoriaId = cats[0].id_categoria;
      } else {
        const [newCat] = await conn.execute('INSERT INTO Categorias (nombre) VALUES (?)', [id_categoria]);
        categoriaId = newCat.insertId;
      }
    }
    const [result] = await conn.execute(
      `INSERT INTO Productos (id_vendedor, id_categoria, nombre, descripcion, precio_base, estado_prenda)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id_vendedor, categoriaId || null, nombre, descripcion || '', precio_base, estado_prenda || 'Buen estado']
    );
    res.status(201).json({ id_producto: result.insertId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  } finally { conn?.end(); }
});

// ============= SUBIR FOTO DE PRODUCTO =============
app.post('/productos/:id/foto', upload.single('foto'), async (req, res) => {
  const idProducto = req.params.id;
  if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna foto' });

  const urlFoto = req.file.path;

  let conn;
  try {
    conn = await mysql.createConnection(dbConfig);
    await conn.execute(
      'UPDATE Fotos_Producto SET es_principal = FALSE WHERE id_producto = ?',
      [idProducto]
    );
    await conn.execute(
      `INSERT INTO Fotos_Producto (id_producto, url_foto, es_principal, orden) VALUES (?, ?, TRUE, 1)`,
      [idProducto, urlFoto]
    );
    res.json({ url_foto: urlFoto });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  } finally { conn?.end(); }
});

// ============= ELIMINAR PRODUCTO =============
app.delete('/productos/:id', async (req, res) => {
  let conn;
  try {
    conn = await mysql.createConnection(dbConfig);
    await conn.execute('DELETE FROM Productos WHERE id_producto = ?', [req.params.id]);
    res.json({ mensaje: 'Producto eliminado' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  } finally { conn?.end(); }
});

// ============= RECUPERAR CONTRASEÑA =============
app.post('/recuperar/verificar', async (req, res) => {
  const { correo, telefono } = req.body;
  if (!correo || !telefono) return res.status(400).json({ error: 'Faltan campos' });
  let conn;
  try {
    conn = await mysql.createConnection(dbConfig);
    const [rows] = await conn.execute(
      'SELECT id_usuario FROM Usuarios WHERE correo = ? AND telefono = ?',
      [correo, telefono]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'No existe ninguna cuenta con esos datos' });
    res.json({ id_usuario: rows[0].id_usuario });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  } finally { conn?.end(); }
});

app.put('/recuperar/cambiar', async (req, res) => {
  const { id_usuario, nueva_contrasena } = req.body;
  if (!id_usuario || !nueva_contrasena) return res.status(400).json({ error: 'Faltan campos' });
  let conn;
  try {
    conn = await mysql.createConnection(dbConfig);
    await conn.execute(
      'UPDATE Usuarios SET contrasena = ? WHERE id_usuario = ?',
      [nueva_contrasena, id_usuario]
    );
    res.json({ mensaje: 'Contrasena actualizada correctamente' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  } finally { conn?.end(); }
});

// ============= INICIAR SERVIDOR =============
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Servidor FKAEH corriendo en puerto ${PORT}`);
});