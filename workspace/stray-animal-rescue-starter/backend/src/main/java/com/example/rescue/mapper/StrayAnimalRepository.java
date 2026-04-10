package com.example.rescue.mapper;

import com.example.rescue.entity.StrayAnimal;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StrayAnimalRepository extends JpaRepository<StrayAnimal, Long> {
}
