
import express from 'express';
const app = express();
app.use('/', express.static('./public'));
app.get('/api/health', (_req,res)=>res.json({ok:true}));
app.listen(3000, ()=>console.log('tiny server on 3000'));

