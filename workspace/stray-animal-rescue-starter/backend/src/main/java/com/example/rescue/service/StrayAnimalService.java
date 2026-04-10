package com.example.rescue.service;

import com.example.rescue.entity.StrayAnimal;

import java.util.List;

public interface StrayAnimalService {
    List<StrayAnimal> listAll();
    StrayAnimal save(StrayAnimal strayAnimal);
}
