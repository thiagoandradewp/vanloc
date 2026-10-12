-- =====================================================
-- VANLOC - Dados de demonstração (opcional)
-- =====================================================
-- Cria os 3 motoristas de exemplo com viagens e planos.
-- Esses motoristas NÃO conseguem fazer login (a senha é
-- inválida de propósito). Para remover tudo depois:
--   DELETE FROM motoristas WHERE email LIKE '%@vanloc.com';
-- =====================================================

SET NAMES utf8mb4;

INSERT INTO motoristas (nome, email, senha_hash, telefone) VALUES
    ('Charles Fernando', 'charles@vanloc.com', '!', '(87) 90000-0001'),
    ('João Martins', 'joao@vanloc.com', '!', '(87) 90000-0002'),
    ('Marcos Silva', 'marcos@vanloc.com', '!', '(87) 90000-0003');

INSERT INTO viagens (motorista_id, origem, destino, data, horario, valor, vagas, foto)
SELECT id, 'Serra Talhada', 'Recife', CURDATE() + INTERVAL 3 DAY, '06:30', 80.00, 12, ''
FROM motoristas WHERE email = 'charles@vanloc.com';

INSERT INTO viagens (motorista_id, origem, destino, data, horario, valor, vagas, foto)
SELECT id, 'Recife', 'Caruaru', CURDATE() + INTERVAL 4 DAY, '08:00', 45.00, 12, ''
FROM motoristas WHERE email = 'joao@vanloc.com';

INSERT INTO viagens (motorista_id, origem, destino, data, horario, valor, vagas, foto)
SELECT id, 'Serra Talhada', 'Petrolina', CURDATE() + INTERVAL 5 DAY, '05:00', 100.00, 12, ''
FROM motoristas WHERE email = 'marcos@vanloc.com';

INSERT INTO planos (motorista_id, nome, valor, quantidade, vantagens)
SELECT id, 'Plano Frequente', 25.00, 10, '["Prioridade nas reservas","Desconto nas viagens","Atendimento prioritário"]'
FROM motoristas WHERE email = 'charles@vanloc.com';

INSERT INTO planos (motorista_id, nome, valor, quantidade, vantagens)
SELECT id, 'Plano Básico', 20.00, 4, '["Reserva antecipada","Suporte pela VANLOC"]'
FROM motoristas WHERE email = 'charles@vanloc.com';

INSERT INTO planos (motorista_id, nome, valor, quantidade, vantagens)
SELECT id, 'Plano Mensal', 22.00, 8, '["Vaga garantida","Suporte pela VANLOC"]'
FROM motoristas WHERE email = 'joao@vanloc.com';

INSERT INTO planos (motorista_id, nome, valor, quantidade, vantagens)
SELECT id, 'Plano Premium', 30.00, 12, '["Prioridade máxima","Descontos especiais","Benefícios exclusivos"]'
FROM motoristas WHERE email = 'marcos@vanloc.com';

INSERT INTO planos (motorista_id, nome, valor, quantidade, vantagens)
SELECT id, 'Plano Econômico', 20.00, 4, '["Ideal para viagens ocasionais"]'
FROM motoristas WHERE email = 'marcos@vanloc.com';
