CREATE DATABASE IF NOT EXISTS stray_rescue DEFAULT CHARACTER SET utf8mb4;
USE stray_rescue;

CREATE TABLE IF NOT EXISTS stray_animal (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100),
    category VARCHAR(50),
    age INT,
    gender VARCHAR(20),
    health_status VARCHAR(100),
    rescue_status VARCHAR(100),
    description VARCHAR(500)
);
